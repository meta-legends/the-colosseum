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
  participants: Character[];
}

export class BettingArenaUI {
  private container: HTMLElement;
  private battle: Battle | null = null;
  private odds: Map<string, number> = new Map(); // Using standard numbers for client-side
  private oddsPollInterval: number | null = null;

  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) {
      throw new Error(`Container with id "${containerId}" not found.`);
    }
    this.container = element;
    this.render(); // Initial render
  }

  public async loadBattle(battle: Battle) {
    this.battle = battle;
    this.render();
    this.startOddsPolling();
  }

  private render() {
    if (!this.battle) {
      this.container.innerHTML = '<p>Waiting for the next battle to begin...</p>';
      return;
    }

    const fightersHtml = this.battle.participants.map(p => this.createFighterCard(p)).join(
      this.battle.type === 'TEAM_BATTLE' ? '<div class="vs-divider">VS</div>' : ''
    );
    
    this.container.innerHTML = `
      <div class="fighters ${this.battle.type === 'BATTLE_ROYALE' ? 'battle-royale' : ''}">
        ${fightersHtml}
      </div>
      <div class="betting-controls">
        <div class="bet-amount-container">
          <label for="betAmount">Bet Amount</label>
          <input type="number" id="betAmount" placeholder="0.00" min="0.01" step="0.01" />
        </div>
      </div>
    `;
    
    this.addBetButtonListeners();
  }

  private createFighterCard(character: Character): string {
    const characterOdds = this.odds.get(character.id)?.toFixed(2) || '...';
    return `
      <div class="fighter" data-character-id="${character.id}">
        <div class="fighter-name">${character.name}</div>
        <div class="fighter-odds">${characterOdds}x</div>
        <button class="bet-button">Bet</button>
      </div>
    `;
  }

  private addBetButtonListeners() {
    this.container.querySelectorAll('.bet-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const fighterCard = (e.currentTarget as HTMLElement).closest<HTMLElement>('.fighter');
        if (fighterCard) {
          const characterId = fighterCard.dataset.characterId;
          const betAmountInput = this.container.querySelector<HTMLInputElement>('#betAmount');
          const amount = betAmountInput?.value;
          if (characterId && amount) {
            this.handleBetPlacement(characterId, parseFloat(amount));
          } else {
            alert("Please enter a valid bet amount.");
          }
        }
      });
    });
  }

  private async handleBetPlacement(characterId: string, amount: number) {
    if (!this.battle || !this.battle.id) {
        alert("No active battle to bet on.");
        return;
    }
    
    const { authData } = await import('../auth');
    if (!authData) {
        alert("Please connect your wallet to place a bet.");
        return;
    }

    try {
        const response = await fetch(`/api/battles/${this.battle.id}/bet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: authData.id,
                characterId: characterId,
                amount: amount,
            }),
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Bet of ${amount} placed successfully on character ${characterId}!`);
            // Optionally, update user's point balance in the UI
        } else {
            throw new Error(result.error || 'Failed to place bet.');
        }
    } catch (error) {
        console.error("Error placing bet:", error);
        alert(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`);
    }
  }

  private async updateOdds() {
    if (!this.battle) return;

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