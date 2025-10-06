// Profile Setup Module
export interface ProfileSetupData {
  username: string;
  walletAddress: string;
}

export interface UserProfile {
  id: string;
  walletAddress: string;
  username: string | null;
  balance: number;
  hasUsername: boolean;
}

let profileSetupCallback: ((data: ProfileSetupData) => void) | null = null;
let currentWalletAddress: string = '';

// Initialize profile setup modal
export function initProfileSetup() {
  const modal = document.getElementById('profileSetupModal') as HTMLElement;
  const form = document.getElementById('profileSetupForm') as HTMLFormElement;
  const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
  const validationDiv = document.getElementById('usernameValidation') as HTMLElement;
  const saveBtn = document.getElementById('saveProfileBtn') as HTMLButtonElement;
  const skipBtn = document.getElementById('skipProfileBtn') as HTMLButtonElement;

  let debounceTimer: number | null = null;

  // Username validation function
  async function validateUsername(username: string): Promise<{ valid: boolean; message: string }> {
    if (!username) {
      return { valid: false, message: '' };
    }

    if (username.length < 3) {
      return { valid: false, message: 'Username must be at least 3 characters' };
    }

    if (username.length > 20) {
      return { valid: false, message: 'Username must be less than 20 characters' };
    }

    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(username)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/users/check-username/${encodeURIComponent(username.toLowerCase())}`);
      const data = await response.json();

      if (!response.ok) {
        return { valid: false, message: data.error || 'Error checking username' };
      }

      if (!data.available) {
        return { valid: false, message: 'Username is already taken' };
      }

      return { valid: true, message: 'Username is available!' };
    } catch (error) {
      console.error('Error checking username:', error);
      return { valid: false, message: 'Error checking username availability' };
    }
  }

  // Real-time username validation
  usernameInput.addEventListener('input', () => {
    const username = usernameInput.value.trim();
    
    // Clear previous timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Clear validation message if empty
    if (!username) {
      validationDiv.textContent = '';
      validationDiv.className = 'validation-message';
      saveBtn.disabled = true;
      return;
    }

    // Show checking message
    validationDiv.textContent = 'Checking availability...';
    validationDiv.className = 'validation-message checking';
    saveBtn.disabled = true;

    // Debounce the validation
    debounceTimer = window.setTimeout(async () => {
      const result = await validateUsername(username);
      
      validationDiv.textContent = result.message;
      validationDiv.className = `validation-message ${result.valid ? 'success' : 'error'}`;
      saveBtn.disabled = !result.valid;
    }, 500);
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    if (!username) return;

    // Validate one more time
    const result = await validateUsername(username);
    if (!result.valid) {
      validationDiv.textContent = result.message;
      validationDiv.className = 'validation-message error';
      return;
    }

    // Call the callback if set
    if (profileSetupCallback) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      try {
        await profileSetupCallback({
          username: username.toLowerCase(),
          walletAddress: currentWalletAddress
        });
        closeProfileSetup();
      } catch (error) {
        console.error('Error saving profile:', error);
        validationDiv.textContent = 'Error saving profile. Please try again.';
        validationDiv.className = 'validation-message error';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Profile';
      }
    }
  });

  // Skip button
  skipBtn.addEventListener('click', () => {
    closeProfileSetup();
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeProfileSetup();
    }
  });

  // Prevent closing with Escape key for now (we want users to set username)
  // document.addEventListener('keydown', (e) => {
  //   if (e.key === 'Escape' && modal.style.display !== 'none') {
  //     closeProfileSetup();
  //   }
  // });
}

// Show profile setup modal
export function showProfileSetup(walletAddress: string, callback: (data: ProfileSetupData) => void) {
  console.log('showProfileSetup called with wallet address:', walletAddress);
  profileSetupCallback = callback;
  currentWalletAddress = walletAddress;
  
  const modal = document.getElementById('profileSetupModal') as HTMLElement;
  const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
  const validationDiv = document.getElementById('usernameValidation') as HTMLElement;
  const saveBtn = document.getElementById('saveProfileBtn') as HTMLButtonElement;
  
  if (!modal) {
    console.error('Profile setup modal not found in DOM');
    return;
  }
  
  console.log('Modal element found, setting up form...');
  
  // Reset form
  usernameInput.value = '';
  validationDiv.textContent = '';
  validationDiv.className = 'validation-message';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Save Profile';
  
  // Show modal
  modal.style.display = 'flex';
  console.log('Modal display set to flex, modal should now be visible');
  
  // Focus input
  setTimeout(() => {
    usernameInput.focus();
    console.log('Input field focused');
  }, 100);
}

// Close profile setup modal
export function closeProfileSetup() {
  const modal = document.getElementById('profileSetupModal') as HTMLElement;
  modal.style.display = 'none';
  profileSetupCallback = null;
  currentWalletAddress = '';
}

// API functions for profile management
export async function updateUserProfile(walletAddress: string, username: string): Promise<UserProfile> {
  const response = await fetch('${import.meta.env.VITE_BACKEND_URL}/api/users/update-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      walletAddress,
      username: username.toLowerCase(),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update profile');
  }

  return response.json();
}

export async function getUserProfile(walletAddress: string): Promise<UserProfile> {
  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/users/profile/${encodeURIComponent(walletAddress)}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch profile');
  }

  return response.json();
}

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; username: string }> {
  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/users/check-username/${encodeURIComponent(username.toLowerCase())}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to check username');
  }

  return response.json();
}
