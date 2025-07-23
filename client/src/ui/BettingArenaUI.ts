import { eventBus } from '../events';

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
        const response = await fetch(`/api/battles/${this.battle.id}/bets?userId=${user.id}`);
        if (response.ok) {
          const bets = await response.json();
          this.confirmedBets = bets.map((bet: any) => ({
            characterName: bet.character.name,
            amount: parseFloat(bet.amount),
            odds: parseFloat(bet.odds),
            payout: parseFloat(bet.amount) * parseFloat(bet.odds),
          }));
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

  private setupEventListeners() {
    this.container.addEventListener('click', (e) => {
      console.log('Click event detected on container.');
      const target = e.target as HTMLElement;

      // Handle fighter selection
      const fighterCard = target.closest<HTMLElement>('.fighter');
      if (fighterCard && target.classList.contains('bet-button')) {
        this.selectedCharacterId = this.selectedCharacterId === fighterCard.dataset.characterId ? null : fighterCard.dataset.characterId || null;
        console.log('Fighter selected:', this.selectedCharacterId);
        this.render();
        return;
      }

      // Handle confirm button click
      if (target.id === 'confirmBetBtn' && !this.bettingLocked) {
        const betAmountInput = this.container.querySelector<HTMLInputElement>('#betAmount');
        const amount = parseFloat(betAmountInput?.value || '0');
        if (this.selectedCharacterId && amount > 0) {
          this.handleConfirmBet(this.selectedCharacterId, amount);
        }
      }
    });
    
    this.container.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'betAmount' && this.selectedCharacterId) {
        this.updateConfirmationDetails();
      }
    });
  }

  private render() {
    console.log('Rendering UI. Selected character:', this.selectedCharacterId);
    
    if (!this.battle) {
      this.container.innerHTML = '<p>Waiting for the next battle to begin...</p>';
      return;
    }

    const fightersHtml = this.battle.participants.map(p => this.createFighterCard(p)).join(
      this.battle.type === 'TEAM_BATTLE' ? '<div class="vs-divider">VS</div>' : ''
    );
    
    const ticketsHtml = this.confirmedBets.map(ticket => this.createTicketHtml(ticket)).join('');

    this.container.innerHTML = `
      <div class="fighters ${this.battle.type === 'BATTLE_ROYALE' ? 'battle-royale' : ''}">
        ${fightersHtml}
      </div>
      <div class="betting-controls">
        <div class="bet-amount-container">
          <label for="betAmount">Bet Amount</label>
          <input type="number" id="betAmount" placeholder="0.00" min="0.01" step="0.01" ${this.bettingLocked ? 'disabled' : ''} />
        </div>
        <div id="confirmation-area">
          ${this.createConfirmationHtml()}
        </div>
      </div>
      <div class="bet-tickets-container">
        ${ticketsHtml}
      </div>
    `;
  }

  private createFighterCard(character: Character): string {
    if (this.battle?.bettingType === 'PARIMUTUEL') {
      const poolSize = this.pools.get(character.id)?.toFixed(2) || '0.00';
      const isSelected = this.selectedCharacterId === character.id;
      return `
        <div class="fighter ${isSelected ? 'selected' : ''}" data-character-id="${character.id}">
          <div class="fighter-name">${character.name}</div>
          <div class="fighter-pool-size">Pool: ${poolSize}</div>
          <button class="bet-button" ${this.bettingLocked ? 'disabled' : ''}>Select</button>
        </div>
      `;
    }

    // AMM Card
    const characterOdds = this.odds.get(character.id)?.toFixed(2) || '...';
    const isSelected = this.selectedCharacterId === character.id;
    return `
      <div class="fighter ${isSelected ? 'selected' : ''}" data-character-id="${character.id}">
        <div class="fighter-name">${character.name}</div>
        <div class="fighter-odds">${characterOdds}x</div>
        <button class="bet-button" ${this.bettingLocked ? 'disabled' : ''}>Select</button>
      </div>
    `;
  }

  private createTicketHtml(ticket: BetTicket): string {
    return `
      <div class="bet-ticket">
        <p><strong>Bet on:</strong> ${ticket.characterName}</p>
        <p><strong>Amount:</strong> ${ticket.amount.toFixed(2)}</p>
        <p><strong>Odds:</strong> ${ticket.odds.toFixed(2)}x</p>
        <p><strong>Potential Payout:</strong> ${ticket.payout.toFixed(2)}</p>
      </div>
    `;
  }
  
  private updateConfirmationDetails() {
      const confirmationArea = this.container.querySelector('#confirmation-area');
      if (confirmationArea) {
        confirmationArea.innerHTML = this.createConfirmationHtml();
      }
  }

  private createConfirmationHtml(): string {
    if (this.bettingLocked) {
      return '<div class="betting-closed-message">Betting is now closed.</div>';
    }
    if (!this.selectedCharacterId) {
      return '';
    }

    const betAmountInput = this.container.querySelector<HTMLInputElement>('#betAmount');
    const amount = parseFloat(betAmountInput?.value || '0');
    const character = this.battle?.participants.find(p => p.id === this.selectedCharacterId);

    if (this.battle?.bettingType === 'PARIMUTUEL') {
        const totalPool = Array.from(this.pools.values()).reduce((sum, vol) => sum + vol, 0);
        const myPool = this.pools.get(this.selectedCharacterId) || 0;
        const opposingPool = totalPool - myPool;
        const myShare = (amount / (myPool + amount));
        const payout = amount + (opposingPool * myShare);

        if (!character || !amount) {
            return '<button id="confirmBetBtn" class="bet-button-confirm" disabled>Enter an amount</button>';
        }

        return `
            <div class="confirmation-details">
                <span>Est. Payout: ${payout.toFixed(2)}</span>
            </div>
            <button id="confirmBetBtn" class="bet-button-confirm">Confirm Bet on ${character.name}</button>
        `;
    }

    // AMM Confirmation
    const odds = this.odds.get(this.selectedCharacterId) || 0;
    const payout = amount * odds;

    if (!character || !amount) {
      return '<button id="confirmBetBtn" class="bet-button-confirm" disabled>Enter an amount</button>';
    }

    return `
      <div class="confirmation-details">
        <span>Payout: ${payout.toFixed(2)}</span>
      </div>
      <button id="confirmBetBtn" class="bet-button-confirm">Confirm Bet on ${character.name}</button>
    `;
  }

  private async handleConfirmBet(characterId: string, amount: number) {
    if (!this.battle || !this.battle.id) {
        alert("No active battle to bet on.");
        return;
    }
    
    const { authData } = await import('../auth');
    if (!authData) {
        alert("Please connect your wallet to place a bet.");
        return;
    }

    const endpoint = this.battle.bettingType === 'PARIMUTUEL' ? `/api/mvp/battles/${this.battle.id}/bet` : `/api/battles/${this.battle.id}/bet`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: authData.id,
                characterId: characterId,
                amount: amount,
            }),
        });

        const result = await response.json();

        if (response.ok) {
            const character = this.battle.participants.find(p => p.id === characterId);
            if (this.battle.bettingType === 'PARIMUTUEL') {
                const totalPool = Array.from(this.pools.values()).reduce((sum, vol) => sum + vol, 0);
                const myPool = this.pools.get(characterId) || 0;
                const opposingPool = totalPool - myPool;
                const myShare = (amount / (myPool + amount));
                const payout = amount + (opposingPool * myShare);
                this.confirmedBets.push({
                  characterName: character?.name || 'Unknown',
                  amount: amount,
                  odds: 0, // Parimutuel doesn't have fixed odds
                  payout: payout,
                });
            } else {
                const odds = this.odds.get(characterId) || 0;
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
} 