import { ethers } from "ethers";
import { supabase } from './supabase';
import { type User } from "@supabase/supabase-js";
import { trackPresence, untrackPresence } from './chat';
import { eventBus } from './events';
import walletConnector from './utils/walletConnector';
import { showProfileSetup, updateUserProfile, getUserProfile, type UserProfile } from './profile';

// This will hold the authenticated user data globally
export let authData: User | { id: string; balance: number | string; walletAddress: string; } | null = null;

export const setAuthData = (data: User | { id: string; balance: number | string; walletAddress: string; } | null) => {
  authData = data;
  updateUI(authData);
  eventBus.emit('authChanged', authData); // Emit event
};

const userInfo = document.querySelector<HTMLDivElement>('#userInfo')!;
const userAddressSpan = document.querySelector<HTMLSpanElement>('#userAddress')!;

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function generateAvatarGradient(address: string): string {
  const hash = address.slice(2, 8);
  const hue1 = parseInt(hash.slice(0, 2), 16) % 360;
  const hue2 = parseInt(hash.slice(2, 4), 16) % 360;
  const hue3 = parseInt(hash.slice(4, 6), 16) % 360;
  return `linear-gradient(45deg, hsl(${hue1}, 70%, 60%), hsl(${hue2}, 70%, 60%), hsl(${hue3}, 70%, 60%))`;
}

function updateUI(user: User | { id: string; balance: number | string; walletAddress: string; username?: string | null; } | null) {
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  const testLoginBtn = document.querySelector<HTMLButtonElement>('#testLoginBtn');
  const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
  const userAddress = document.querySelector<HTMLSpanElement>('#userAddress');
  const battlePoints = document.querySelector<HTMLSpanElement>('#battlePoints');
  const networkDisplay = document.querySelector<HTMLSpanElement>('#networkDisplay');

  console.log('UpdateUI called with user:', user ? { hasUsername: !!('username' in user ? user.username : null), walletAddress: 'walletAddress' in user ? user.walletAddress : user.email } : null);

  if (user && connectWalletBtn && userInfo && userAddress && battlePoints && testLoginBtn) {
    // Hide login buttons and show user info
    connectWalletBtn.style.display = 'none';
    testLoginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    
    // Show username if available, otherwise show shortened address
    const address = 'walletAddress' in user ? user.walletAddress : user.email || '';
    const username = 'username' in user ? user.username : null;
    
    if (username) {
      userAddress.textContent = username;
      userAddress.title = address; // Show full address on hover
    } else {
      userAddress.textContent = shortenAddress(address);
      userAddress.title = address;
    }
    
    if ('balance' in user && user.balance !== null && user.balance !== undefined) {
      const balanceValue = parseFloat(user.balance.toString());
      battlePoints.textContent = balanceValue.toFixed(2);
    } else {
      battlePoints.textContent = "0.00";
    }

    // Update network display if wallet is connected
    if (walletConnector.isConnected() && networkDisplay) {
      const chainId = walletConnector.getCurrentChainId();
      networkDisplay.textContent = getNetworkName(chainId || '');
    }

  } else if (connectWalletBtn && userInfo && testLoginBtn) {
    // Show login buttons and hide user info
    connectWalletBtn.style.display = 'block';
    testLoginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    
    // Make sure the connect button is enabled and has correct text
    connectWalletBtn.disabled = false;
    connectWalletBtn.textContent = 'Connect Wallet';
    connectWalletBtn.classList.remove('loading');
  }
}

function shortenAddress(address: string, chars = 4) {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export async function handleConnectWallet(): Promise<User | null> {
  if (!walletConnector.isMetaMaskInstalled()) {
    showError('Please install MetaMask to continue');
    return null;
  }

  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  if (!connectWalletBtn) {
    console.error('Connect wallet button not found');
    return null;
  }

  try {
    connectWalletBtn.textContent = 'Connecting...';
    connectWalletBtn.disabled = true;
    connectWalletBtn.classList.add('loading');

    // Use the enhanced wallet connector
    const connection = await walletConnector.connectWallet();
    
    console.log('Wallet connected:', connection.account);
    console.log('Network:', connection.chainId);
    
    // Store wallet address globally for profile functions
    (window as any).currentWalletAddress = connection.account;
    
    // The walletConnector already handles server authentication in its connectWallet method
    // Now check if user has a profile setup
    const currentAccount = walletConnector.getCurrentAccount();
    if (currentAccount) {
      try {
        // Try to get user profile
        console.log('Attempting to get user profile for:', currentAccount);
        const profile = await getUserProfile(currentAccount);
        console.log('Profile retrieved successfully:', profile);
        
        if (!profile.hasUsername) {
          // Show profile setup modal
          console.log('User needs to set up profile, showing modal...');
          showProfileSetup(currentAccount, async (profileData) => {
            try {
              const updatedProfile = await updateUserProfile(profileData.walletAddress, profileData.username);
              
              // Update auth data with new profile
              const updatedUser = {
                id: updatedProfile.id,
                email: updatedProfile.walletAddress,
                walletAddress: updatedProfile.walletAddress,
                username: updatedProfile.username,
                balance: updatedProfile.balance
              };
              setAuthData(updatedUser);
              
              // Refresh the UI to show the new profile
              updateUI(updatedUser);
              
              showError(`Welcome, ${updatedProfile.username}!`);
            } catch (error) {
              console.error('Error updating profile:', error);
              showError('Failed to update profile. Please try again.');
            }
          });
          
          // Return the basic user object for immediate UI update
          const basicUser = {
            id: profile.id,
            email: profile.walletAddress,
            walletAddress: profile.walletAddress,
            username: null,
            balance: profile.balance
          };
          return basicUser as any;
          
        } else {
          // User already has a profile, use it
          console.log('User already has profile, using existing data');
          const user = {
            id: profile.id,
            email: profile.walletAddress,
            walletAddress: profile.walletAddress,
            username: profile.username,
            balance: profile.balance
          };
          setAuthData(user);
          showError(`Welcome back, ${profile.username || 'User'}!`);
          return user as any;
        }
        
      } catch (profileError) {
        console.error('Error fetching profile:', profileError);
        // This is likely a first-time user - show profile setup modal
        console.log('Profile fetch failed - likely first-time user, showing profile setup modal...');
        
        // Create a basic user object for immediate UI update
        const user = {
          id: currentAccount,
          email: currentAccount,
          walletAddress: currentAccount,
          balance: 0
        };
        setAuthData(user);
        
        // Show profile setup modal immediately
        console.log('About to call showProfileSetup with wallet address:', currentAccount);
        
        showProfileSetup(currentAccount, async (profileData) => {
          console.log('Profile setup callback received:', profileData);
          try {
            const updatedProfile = await updateUserProfile(profileData.walletAddress, profileData.username);
            console.log('Profile updated successfully:', updatedProfile);
            
            // Update auth data with new profile
            const updatedUser = {
              id: updatedProfile.id,
              email: updatedProfile.walletAddress,
              walletAddress: updatedProfile.walletAddress,
              username: updatedProfile.username,
              balance: updatedProfile.balance
            };
            setAuthData(updatedUser);
            
            // Refresh the UI to show the new profile
            updateUI(updatedUser);
            
            showError(`Welcome, ${updatedProfile.username}!`);
          } catch (error) {
            console.error('Error updating profile:', error);
            showError('Failed to update profile. Please try again.');
          }
        });
        
        console.log('Profile setup modal should now be visible');
        
        return user as any;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error connecting to wallet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    if (errorMessage.includes('User rejected')) {
      showError('Connection cancelled by user');
    } else {
      showError(errorMessage);
    }
    return null;
  } finally {
    // Reset button state
    const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
    if (connectWalletBtn) {
      connectWalletBtn.textContent = 'Connect Wallet';
      connectWalletBtn.disabled = false;
      connectWalletBtn.classList.remove('loading');
    }
  }
}

function showError(message: string) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'status-indicator error';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 5000);
}

export async function checkWalletConnection(): Promise<void> {
  // First check if wallet is already connected
  if (walletConnector.isConnected()) {
    const account = walletConnector.getCurrentAccount();
    const chainId = walletConnector.getCurrentChainId();
    console.log('Found existing wallet connection:', account, 'on network:', chainId);
    
    // Update UI with existing connection
    const user = {
      id: account || '',
      email: account || '',
      walletAddress: account || '',
      balance: 0
    };
    setAuthData(user);
    return;
  }

  // Then check for Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    console.log('Found active Supabase session.');
    setAuthData(session.user);
  } else {
     console.log('No active connection found.');
  }
}

// Setup wallet event listeners
export function setupWalletEventListeners() {
  // Account changed handler
  walletConnector.onAccountChanged = (newAccount: string) => {
    console.log('Account changed to:', newAccount);
    const user = {
      id: newAccount,
      email: newAccount,
      walletAddress: newAccount,
      balance: 0
    };
    setAuthData(user);
    showError(`Switched to account: ${shortenAddress(newAccount)}`);
  };

  // Network changed handler
  walletConnector.onNetworkChanged = (newChainId: string) => {
    console.log('Network changed to:', newChainId);
    const networkDisplay = document.querySelector<HTMLSpanElement>('#networkDisplay');
    if (networkDisplay) {
      networkDisplay.textContent = getNetworkName(newChainId);
    }
    showError(`Switched to network: ${getNetworkName(newChainId)}`);
  };

  // Disconnection handler
  walletConnector.onDisconnected = () => {
    console.log('Wallet disconnected');
    setAuthData(null);
    showError('Wallet disconnected');
  };
}

// Add disconnect wallet functionality
export async function handleDisconnectWallet(): Promise<void> {
  try {
    // Disconnect from wallet
    walletConnector.disconnect();
    
    // Clear auth data
    setAuthData(null);
    
    // Clear any stored wallet data
    (window as any).currentWalletAddress = null;
    
    // Reset UI to show connect button
    const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
    const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
    const testLoginBtn = document.querySelector<HTMLButtonElement>('#testLoginBtn');
    
    if (connectWalletBtn && userInfo && testLoginBtn) {
      connectWalletBtn.style.display = 'block';
      testLoginBtn.style.display = 'block';
      userInfo.style.display = 'none';
      
      // Reset button state
      connectWalletBtn.disabled = false;
      connectWalletBtn.textContent = 'Connect Wallet';
      connectWalletBtn.classList.remove('loading');
    }
    
    showError('Wallet disconnected successfully');
  } catch (error) {
    console.error('Error disconnecting wallet:', error);
    showError('Error disconnecting wallet');
  }
}

// Helper function to get network name
function getNetworkName(chainId: string): string {
  const networks: Record<string, string> = {
    '0x1': 'Ethereum Mainnet',
    '0x89': 'Polygon',
    '0xa4b1': 'Arbitrum One',
    '0x38': 'BSC',
    '0xaa36a7': 'Sepolia Testnet',
    '0x13881': 'Mumbai Testnet'
  };
  return networks[chainId] || `Unknown (${chainId})`;
}

// Debug function to check current wallet and button state
export function debugWalletState(): void {
  console.log('=== Wallet Debug State ===');
  console.log('MetaMask installed:', walletConnector.isMetaMaskInstalled());
  console.log('Wallet connected:', walletConnector.isConnected());
  console.log('Current account:', walletConnector.getCurrentAccount());
  console.log('Current chainId:', walletConnector.getCurrentChainId());
  
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
  
  console.log('Connect button visible:', connectWalletBtn ? connectWalletBtn.style.display !== 'none' : 'Button not found');
  console.log('Connect button disabled:', connectWalletBtn?.disabled || false);
  console.log('Connect button text:', connectWalletBtn?.textContent || 'Button not found');
  console.log('User info visible:', userInfo ? userInfo.style.display !== 'none' : 'UserInfo not found');
  
  // Check for profile modal
  const profileModal = document.getElementById('profileSetupModal');
  console.log('Profile modal visible:', profileModal ? profileModal.style.display !== 'none' : 'Modal not found');
  
  console.log('=== End Debug State ===');
}

// Make debug function available globally for testing
(window as any).debugWalletState = debugWalletState;

// Force reset wallet state (for debugging)
export function forceResetWalletState(): void {
  console.log('Force resetting wallet state...');
  
  // Disconnect wallet
  walletConnector.disconnect();
  
  // Clear auth data
  setAuthData(null);
  
  // Clear stored data
  (window as any).currentWalletAddress = null;
  
  // Force UI reset
  const connectWalletBtn = document.querySelector<HTMLButtonElement>('#connectWalletBtn');
  const userInfo = document.querySelector<HTMLDivElement>('#userInfo');
  const testLoginBtn = document.querySelector<HTMLButtonElement>('#testLoginBtn');
  
  if (connectWalletBtn && userInfo && testLoginBtn) {
    connectWalletBtn.style.display = 'block';
    testLoginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    
    connectWalletBtn.disabled = false;
    connectWalletBtn.textContent = 'Connect Wallet';
    connectWalletBtn.classList.remove('loading');
  }
  
  console.log('Wallet state force reset complete');
}

// Make force reset available globally for debugging
(window as any).forceResetWalletState = forceResetWalletState;

// Manual profile setup trigger
export function triggerProfileSetup(): void {
  const currentAccount = walletConnector.getCurrentAccount();
  if (currentAccount) {
    console.log('Manually triggering profile setup for:', currentAccount);
    showProfileSetup(currentAccount, async (profileData) => {
      try {
        const updatedProfile = await updateUserProfile(profileData.walletAddress, profileData.username);
        
        // Update auth data with new profile
        const updatedUser = {
          id: updatedProfile.id,
          email: updatedProfile.walletAddress,
          walletAddress: updatedProfile.walletAddress,
          username: updatedProfile.username,
          balance: updatedProfile.balance
        };
        setAuthData(updatedUser);
        showError(`Welcome, ${updatedProfile.username}!`);
      } catch (error) {
        console.error('Error updating profile:', error);
        showError('Failed to update profile. Please try again.');
      }
    });
  } else {
    showError('No wallet connected. Please connect your wallet first.');
  }
}

// Make profile setup available globally for debugging
(window as any).triggerProfileSetup = triggerProfileSetup;

// Centralized auth state listener
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event);
  if (event === 'SIGNED_OUT') {
    setAuthData(null);
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    if(session) {
        setAuthData(session.user);
    }
  }
});

