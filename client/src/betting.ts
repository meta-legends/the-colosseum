import io from 'socket.io-client';

let socket: any;

export function initializeBetting(userId: string, battleId: string) {
  if (!socket) {
    socket = io();
  }

  fetch('/api/betting/battle/current')
    .then(res => res.json())
    .then(battle => {
      document.getElementById('battleTitle')!.textContent = battle.title;
      document.getElementById('constituentAName')!.textContent = battle.constituentA.name;
      document.getElementById('constituentAOdds')!.textContent = battle.oddsA;
      document.getElementById('constituentBName')!.textContent = battle.constituentB.name;
      document.getElementById('constituentBOdds')!.textContent = battle.oddsB;
      document.getElementById('bettingStatus')!.textContent = battle.bettingLocked ? 'Locked' : 'Open';

      if (battle.bettingLocked) {
        (document.getElementById('betOnA') as HTMLButtonElement).disabled = true;
        (document.getElementById('betOnB') as HTMLButtonElement).disabled = true;
      }
    });

  socket.on('oddsUpdate', (data: any) => {
    if (data.battleId === battleId) {
      document.getElementById('constituentAOdds')!.textContent = data.oddsA;
      document.getElementById('constituentBOdds')!.textContent = data.oddsB;
    }
  });

  socket.on('bettingLocked', (data: any) => {
    if (data.battleId === battleId) {
      document.getElementById('bettingStatus')!.textContent = 'Locked';
      (document.getElementById('betOnA') as HTMLButtonElement).disabled = true;
      (document.getElementById('betOnB') as HTMLButtonElement).disabled = true;
    }
  });

  document.getElementById('betOnA')!.addEventListener('click', () => {
    const amount = (document.getElementById('betAmount') as HTMLInputElement).value;
    placeBet(userId, battleId, 'A', parseInt(amount));
  });

  document.getElementById('betOnB')!.addEventListener('click', () => {
    const amount = (document.getElementById('betAmount') as HTMLInputElement).value;
    placeBet(userId, battleId, 'B', parseInt(amount));
  });
}

export function placeBet(userId: string, battleId: string, constituent: 'A' | 'B', amount: number) {
  fetch('/api/betting/bet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, battleId, constituent, amount }),
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('Bet placed successfully!');
    } else {
      alert(`Error: ${data.error}`);
    }
  });
}