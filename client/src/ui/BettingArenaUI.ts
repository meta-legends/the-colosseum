import { eventBus } from '../events';
import BigNumber from 'bignumber.js';

// Define a type for the battle data we expect from the API
export interface Character {
  id: string;
  name: string;
  // Add other relevant properties like image URLs if available
}

export interface Battle {
  id: string;
  title: string;
  type: 'TEAM_BATTLE' | 'BATTLE_ROYALE';
  bettingType: 'AMM' | 'PARIMUTUEL'; // Add bettingType
  participants: Character[];
  bettingPools: { characterId: string; totalVolume: string; }[];
  startTime: string; // Add startTime to the interface
}

interface BetTicket {
  characterName: string;
  amount: number;
  odds: number;
  payout: number;
}

export class BettingArenaUI {
  private container: HTMLElement;
  private battle: Battle | null = null;
  private odds: Map<string, number> = new Map(); // Using standard numbers for client-side
  private pools: Map<string, number> = new Map(); // For parimutuel
  private oddsPollInterval: number | null = null;
  private countdownInterval: number | null = null;
  private bettingLocked: boolean = false;
  private selectedCharacterId: string | null = null;
  private confirmedBets: BetTicket[] = [];

  // Keep client-side copy of house fee to display net contribution consistently with server
  // Must match server constant F_HOUSE (currently 5.45%)
  private static readonly HOUSE_FEE = 0.0545;
  private static readonly NET_MULTIPLIER = 1 - BettingArenaUI.HOUSE_FEE;

  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) {
      throw new Error(`Container with id "${containerId}" not found.`);
    }
    this.container = element;
    this.render(); // Initial render
    this.setupEventListeners();

    // Listen for auth changes to load user's bets
    eventBus.on('authChanged', (user) => this.handleAuthChange(user));
  }

  public async loadBattle(battle: Battle) {
    this.battle = battle;
    this.startCountdown();
    this.render();
    this.startOddsPolling();
    // After loading a battle, check if we're already logged in
    const { authData } = await import('../auth');
    if (authData) {
      this.handleAuthChange(authData);
    }
  }

  private async handleAuthChange(user: { id: string } | null) {
    if (user && this.battle) {
      try {
        // Guard: only fetch bets if user.id looks like a UUID
        const isUuid = typeof user.id === 'string' && user.id.length === 36 && user.id.includes('-');
        if (!isUuid) {
          return;
        }
        const response = await fetch(`/api/battles/${this.battle.id}/bets?userId=${user.id}`);
        if (response.ok) {
          const bets = await response.json();
          this.confirmedBets = bets.map((bet: any) => {
            const rawAmount = parseFloat(bet.amount);
            const isParimutuel = this.battle?.bettingType === 'PARIMUTUEL';
            const amountForDisplay = isParimutuel
              ? rawAmount * BettingArenaUI.NET_MULTIPLIER
              : rawAmount;
            return {
              characterName: bet.character.name,
              amount: amountForDisplay,
              // For parimutuel bets we render as pool bet, not fixed odds
              odds: isParimutuel ? 0 : parseFloat(bet.odds),
              payout: isParimutuel ? amountForDisplay : rawAmount * parseFloat(bet.odds),
            } as BetTicket;
          });
          this.render();
        }
      } catch (error) {
        console.error("Failed to fetch user's previous bets:", error);
      }
    } else {
      // User logged out, clear the tickets
      this.confirmedBets = [];
      this.render();
    }
  }

  private setupEventListeners(): void {
    if (!this.container) return;
    this.container.addEventListener('click', this.handleDelegatedClick.bind(this));
    
    // Use 'input' event for real-time updates without losing focus
    this.container.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'bet-amount-input' && this.selectedCharacterId) {
        this.updateConfirmationDetails();
      }
    });
  }

  private handleDelegatedClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    const characterId = target.dataset.characterId || '';

    if (action === 'select-character' && characterId) {
      this.handleSelectCharacter(characterId);
    } else if (action === 'confirm-bet') {
      this.handleConfirmBet();
    }
  }
  
  private updateConfirmationDetails(): void {
    const confirmationDiv = this.container.querySelector<HTMLDivElement>('.confirmation-details');
    const betAmountInput = this.container.querySelector<HTMLInputElement>('#bet-amount-input');
    if (!confirmationDiv || !betAmountInput || !this.battle || !this.selectedCharacterId) return;

    const amount = new BigNumber(betAmountInput.value || 0);
    const selectedPool = this.battle.bettingPools.find(p => p.characterId === this.selectedCharacterId);
    
    if (!selectedPool || amount.isNaN() || amount.isLessThanOrEqualTo(0)) {
      confirmationDiv.innerHTML = '<p>Enter a valid bet amount.</p>';
      return;
    }
    
    const potentialPayoutHtml = this.getPotentialPayoutHtml(amount, this.selectedCharacterId);
    confirmationDiv.innerHTML = `
      <p>You are betting: ${amount.toFixed(2)}</p>
      ${potentialPayoutHtml}
    `;
  }

  private handleSelectCharacter(characterId: string): void {
    this.selectedCharacterId = characterId;
    this.render(); // Re-render to show selection and confirmation box
  }

  private async handleConfirmBet(): Promise<void> {
    if (!this.battle || !this.battle.id) {
        alert("No active battle to bet on.");
        return;
    }
    
    const { authData } = await import('../auth');
    if (!authData) {
        alert("Please connect your wallet to place a bet.");
        return;
    }

    const amountInput = this.container.querySelector<HTMLInputElement>('#bet-amount-input');
    const amount = parseFloat(amountInput?.value || '0');
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid bet amount.');
      return;
    }

    const endpoint = this.battle.bettingType === 'PARIMUTUEL' ? `/api/mvp/battles/${this.battle.id}/bet` : `/api/battles/${this.battle.id}/bet`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: authData.id,
                characterId: this.selectedCharacterId,
                amount: amount,
            }),
        });

        const result = await response.json();

        if (response.ok) {
            const character = this.battle.participants.find(p => p.id === this.selectedCharacterId);
            if (this.battle.bettingType === 'PARIMUTUEL') {
                // Use net contribution (after fees) for pool math and ticket display
                const netAmount = amount * BettingArenaUI.NET_MULTIPLIER;
                const totalPool = Array.from(this.pools.values()).reduce((sum, vol) => sum + vol, 0);
                const myPool = this.pools.get(this.selectedCharacterId!) || 0;
                const opposingPool = totalPool - myPool;
                const myShare = (netAmount / (myPool + netAmount));
                const payout = netAmount + (opposingPool * myShare);
                this.confirmedBets.push({
                  characterName: character?.name || 'Unknown',
                  amount: netAmount,
                  odds: 0, // Parimutuel doesn't have fixed odds
                  payout: payout,
                });
            } else {
                const odds = this.odds.get(this.selectedCharacterId!) || 0;
                this.confirmedBets.push({
                  characterName: character?.name || 'Unknown',
                  amount: amount,
                  odds: odds,
                  payout: amount * odds,
                });
            }
            this.selectedCharacterId = null; // Reset selection
            this.render(); // Re-render to show ticket and hide confirmation
            alert(`Bet placed successfully!`);
            
            // Refresh user balance in the header
            const userResponse = await fetch('/api/users/test-user');
            if (userResponse.ok) {
              const updatedUser = await userResponse.json();
              const { setAuthData } = await import('../auth');
              setAuthData(updatedUser);
            }

        } else {
            throw new Error(result.error || 'Failed to place bet.');
        }
    } catch (error) {
        console.error("Error placing bet:", error);
        alert(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`);
    }
  }

  private startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    this.countdownInterval = window.setInterval(() => {
      if (!this.battle) {
        if(this.countdownInterval) clearInterval(this.countdownInterval);
        return;
      }
      
      const now = new Date().getTime();
      const startTime = new Date(this.battle.startTime).getTime();
      const lockTime = startTime - (2 * 60 * 1000);

      const timerEl = document.querySelector<HTMLSpanElement>('#bettingTimer');
      if (timerEl) {
        if (now >= lockTime) {
          timerEl.textContent = 'CLOSED';
          timerEl.classList.add('closed');
          this.bettingLocked = true;
          this.render(); // Re-render to disable controls
          if(this.countdownInterval) clearInterval(this.countdownInterval);
        } else {
          const distance = lockTime - now;
          const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((distance % (1000 * 60)) / 1000);
          timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
      }
    }, 1000);
  }

  private async updateOdds() { // This method will now handle both Odds (AMM) and Pools (Parimutuel)
    if (!this.battle || this.bettingLocked) return;

    if (this.battle.bettingType === 'PARIMUTUEL') {
        try {
            const response = await fetch(`/api/mvp/battles/${this.battle.id}/pools`);
            if (!response.ok) throw new Error('Failed to fetch pools');
            const poolsData = await response.json();
            
            let hasChanged = false;
            poolsData.forEach((pool: any) => {
                const newPoolSize = parseFloat(pool.totalVolume);
                if (this.pools.get(pool.characterId) !== newPoolSize) {
                    this.pools.set(pool.characterId, newPoolSize);
                    hasChanged = true;
                }
            });

            if (hasChanged) {
                this.render(); // Re-render the whole component to update pool sizes and est. payouts
            }
        } catch (error) {
            console.error("Error updating pools:", error);
            this.stopOddsPolling();
        }
        return;
    }
    
    // AMM Logic
    try {
      const response = await fetch(`/api/battles/${this.battle.id}/odds`);
      if (!response.ok) throw new Error('Failed to fetch odds');
      const oddsData = await response.json();
      
      let hasChanged = false;
      for (const charId in oddsData) {
        const newOdd = parseFloat(oddsData[charId]);
        if (this.odds.get(charId) !== newOdd) {
          this.odds.set(charId, newOdd);
          hasChanged = true;
        }
      }

      if(hasChanged) {
        this.updateOddsInUI();
        // Also re-render confirmation area if a character is selected
        if (this.selectedCharacterId) {
          this.updateConfirmationDetails();
        }
      }
    } catch (error) {
      console.error("Error updating odds:", error);
      this.stopOddsPolling();
    }
  }
  
  private updateOddsInUI() {
    if (!this.battle) return;

    this.battle.participants.forEach(p => {
      const oddValue = this.odds.get(p.id)?.toFixed(2) || '...';
      const fighterCard = this.container.querySelector(`.fighter[data-character-id="${p.id}"] .fighter-odds`);
      if (fighterCard) {
        fighterCard.textContent = `${oddValue}x`;
      }
    });
  }

  private startOddsPolling() {
    this.stopOddsPolling(); // Ensure no multiple polls are running
    if (!this.battle) return;

    this.updateOdds(); // Initial fetch
    this.oddsPollInterval = window.setInterval(() => this.updateOdds(), 3000); // Poll every 3 seconds
  }

  private stopOddsPolling() {
    if (this.oddsPollInterval) {
      clearInterval(this.oddsPollInterval);
      this.oddsPollInterval = null;
    }
  }

  private render() {
    if (!this.container) return;

    if (!this.battle) {
      this.container.innerHTML = '<p class="status-message">Waiting for the next battle to begin...</p>';
      return;
    }

    const fightersHtml = this.battle.participants.map(p => this.createFighterCard(p)).join(
      this.battle.type === 'TEAM_BATTLE' ? '<div class="vs-divider">VS</div>' : ''
    );
    
    const ticketsHtml = this.confirmedBets.map(ticket => this.createTicketHtml(ticket)).join('');

    this.container.innerHTML = `
      <div class="battle-header">
        <h2>${this.battle.title}</h2>
        <div class="betting-timer-container">
          Betting closes in: <span id="bettingTimer">--:--</span>
        </div>
      </div>
      <div class="fighters ${this.battle.type === 'BATTLE_ROYALE' ? 'battle-royale' : ''}">
        ${fightersHtml}
      </div>
      <div id="confirmation-area">
        ${this.createConfirmationHtml()}
      </div>
      <div class="bet-tickets-container">
        <h3>Your Bets</h3>
        ${ticketsHtml.length > 0 ? ticketsHtml : '<p>You have not placed any bets for this battle.</p>'}
      </div>
    `;
  }

  private createFighterCard(character: Character): string {
    const isSelected = this.selectedCharacterId === character.id;
    let detailsHtml = '';

    if (this.battle?.bettingType === 'PARIMUTUEL') {
      const poolSize = this.pools.get(character.id)?.toFixed(2) || '0.00';
      detailsHtml = `<div class="fighter-pool-size">Pool: ${poolSize} Pts</div>`;
    } else { // AMM
      const characterOdds = this.odds.get(character.id)?.toFixed(2) || '...';
      detailsHtml = `<div class="fighter-odds">${characterOdds}x</div>`;
    }

    return `
      <div class="fighter ${isSelected ? 'selected' : ''}" data-character-id="${character.id}" data-action="select-character">
        <div class="fighter-name">${character.name}</div>
        ${detailsHtml}
        <button class="bet-button" data-action="select-character" data-character-id="${character.id}" ${this.bettingLocked ? 'disabled' : ''}>
          ${isSelected ? 'Selected' : 'Select'}
        </button>
      </div>
    `;
  }

  private createConfirmationHtml(): string {
    if (this.bettingLocked) {
      return '<div class="betting-closed-message">Betting is now closed.</div>';
    }
    if (!this.selectedCharacterId || !this.battle) {
      return ''; // Don't show anything if no character is selected
    }

    const character = this.battle.participants.find(p => p.id === this.selectedCharacterId);
    if (!character) return '';

    return `
      <div class="confirmation-box">
        <h4>Confirm Bet on ${character.name}</h4>
        <input type="number" id="bet-amount-input" placeholder="0.00" min="0.01" step="0.01" />
        <div class="confirmation-details">
          <p>Enter a bet amount.</p>
        </div>
        <button id="confirm-bet-btn" data-action="confirm-bet" class="bet-button-confirm">Confirm Bet</button>
      </div>
    `;
  }

  private getPotentialPayoutHtml(amount: BigNumber, characterId: string): string {
    if (!this.battle) return '';

    if (this.battle.bettingType === 'PARIMUTUEL') {
      const myPool = new BigNumber(this.pools.get(characterId) || 0);
      const totalPool = Array.from(this.pools.values()).reduce((sum, vol) => sum.plus(new BigNumber(vol)), new BigNumber(0));
      const opposingPool = totalPool.minus(myPool);
      
      // Net contribution after fees must be used for pool share
      const netAmount = amount.times(BettingArenaUI.NET_MULTIPLIER);
      if (myPool.plus(netAmount).isZero()) return '<p>Payout: N/A</p>';
      
      const myShare = netAmount.dividedBy(myPool.plus(netAmount));
      const estimatedWinnings = myShare.times(opposingPool);
      const estimatedPayout = netAmount.plus(estimatedWinnings);
      
      return `<p>Est. Payout: ${estimatedPayout.toFixed(2)} Pts</p>`;
    } else { // AMM
      const odds = new BigNumber(this.odds.get(characterId) || 0);
      const payout = amount.times(odds);
      return `<p>Potential Payout: ${payout.toFixed(2)} Pts (at ${odds.toFixed(2)}x odds)</p>`;
    }
  }

  private createTicketHtml(ticket: BetTicket): string {
    const payoutText = ticket.odds === 0 ? `Est. Payout: ${ticket.payout.toFixed(2)}` : `Payout: ${ticket.payout.toFixed(2)}`;
    return `
      <div class="bet-ticket">
        <p><strong>Bet on:</strong> ${ticket.characterName}</p>
        <p><strong>Amount:</strong> ${ticket.amount.toFixed(2)}</p>
        <p><strong>${ticket.odds === 0 ? 'Pool Bet' : `Odds: ${ticket.odds.toFixed(2)}x`}</p>
        <p><strong>${payoutText}</strong></p>
      </div>
    `;
  }
} 