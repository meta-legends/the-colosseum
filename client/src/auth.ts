import { ethers } from "ethers";

const userInfo = document.querySelector<HTMLDivElement>('#userInfo')!;
const userAddress = document.querySelector<HTMLSpanElement>('#userAddress')!;
const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn')!;

export let authData: { id: string; address: string } | null = null;

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function generateAvatarGradient(address: string): string {
  // Generate a consistent gradient based on wallet address
  const hash = address.slice(2, 8); // Remove 0x and take first 6 chars
  const hue1 = parseInt(hash.slice(0, 2), 16) % 360;
  const hue2 = parseInt(hash.slice(2, 4), 16) % 360;
  const hue3 = parseInt(hash.slice(4, 6), 16) % 360;
  
  return `linear-gradient(45deg, hsl(${hue1}, 70%, 60%), hsl(${hue2}, 70%, 60%), hsl(${hue3}, 70%, 60%))`;
}

export async function handleConnectWallet(): Promise<{ id: string; address: string } | null> {
  if (typeof window.ethereum !== 'undefined') {
    try {
      // Show loading state
      connectWalletBtn.textContent = 'Connecting...';
      connectWalletBtn.disabled = true;
      connectWalletBtn.classList.add('loading');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const address = accounts[0];

      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (response.ok) {
        const user = await response.json();
        authData = user;
        
        // Update UI to show connected state
        if (userAddress) {
          userAddress.textContent = truncateAddress(user.walletAddress);
        }
        
        // Set avatar gradient
        const userAvatar = document.querySelector<HTMLDivElement>('.user-avatar');
        if (userAvatar) {
          userAvatar.style.background = generateAvatarGradient(user.walletAddress);
        }
        
        // Hide connect button and show user info
        if (connectWalletBtn) {
          connectWalletBtn.style.display = 'none';
        }
        if (userInfo) {
          userInfo.style.display = 'flex';
        }
        
        // Update battle points (placeholder for now)
        const battlePoints = document.querySelector<HTMLSpanElement>('#battlePoints');
        if (battlePoints) {
          battlePoints.textContent = '1,250'; // This would come from API in real app
        }
        
        console.log('Wallet connected successfully:', user.walletAddress);
        return user;
      } else {
        console.error('Failed to login');
        showError('Failed to login to server');
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          showError('Connection cancelled by user');
        } else {
          showError('Error connecting to wallet');
        }
      } else {
        showError('Unknown error occurred');
      }
    } finally {
      // Reset button state
      connectWalletBtn.textContent = 'Connect Wallet';
      connectWalletBtn.disabled = false;
      connectWalletBtn.classList.remove('loading');
    }
  } else {
    console.error('Metamask not detected');
    showError('Please install MetaMask to continue');
  }
  return null;
}

function showError(message: string) {
  // Create a temporary error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'status-indicator error';
  errorDiv.textContent = message;
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '80px';
  errorDiv.style.right = '20px';
  errorDiv.style.zIndex = '9999';
  
  document.body.appendChild(errorDiv);
  
  // Remove after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 5000);
}

// Check if wallet is already connected on page load
export async function checkWalletConnection(): Promise<void> {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_accounts', []);
      
      if (accounts.length > 0) {
        const address = accounts[0];
        
        // Try to authenticate with existing connection
        const response = await fetch('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ walletAddress: address }),
        });
        
        if (response.ok) {
          const user = await response.json();
          authData = user;
          
          // Update UI
          if (userAddress) {
            userAddress.textContent = truncateAddress(user.walletAddress);
          }
          
          const userAvatar = document.querySelector<HTMLDivElement>('.user-avatar');
          if (userAvatar) {
            userAvatar.style.background = generateAvatarGradient(user.walletAddress);
          }
          
          if (connectWalletBtn) {
            connectWalletBtn.style.display = 'none';
          }
          if (userInfo) {
            userInfo.style.display = 'flex';
          }
          
          const battlePoints = document.querySelector<HTMLSpanElement>('#battlePoints');
          if (battlePoints) {
            battlePoints.textContent = '1,250';
          }
          
          console.log('Auto-connected to wallet:', user.walletAddress);
        }
      }
    } catch (error) {
      console.log('No existing wallet connection found');
    }
  }
}

// Listen for account changes
if (typeof window.ethereum !== 'undefined') {
  // Type assertion for MetaMask's extended ethereum object
  const ethereum = window.ethereum as any;
  if (ethereum.on) {
    ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected
        authData = null;
        if (connectWalletBtn) {
          connectWalletBtn.style.display = 'block';
        }
        if (userInfo) {
          userInfo.style.display = 'none';
        }
        console.log('Wallet disconnected');
      } else {
        // Account changed, reconnect
        handleConnectWallet();
      }
    });
  }
}