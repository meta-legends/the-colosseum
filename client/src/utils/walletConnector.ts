// walletConnector.ts
// Secure MetaMask Wallet Integration for TypeScript

// Types and Interfaces
interface EthereumProvider {
    isMetaMask?: boolean;
    providers?: EthereumProvider[];
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    on: (event: string, callback: (...args: any[]) => void) => void;
    removeListener: (event: string, callback: (...args: any[]) => void) => void;
  }
  
  interface NetworkConfig {
    chainId: string;
    chainName: string;
    nativeCurrency: {
      name: string;
      symbol: string;
      decimals: number;
    };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
  
  interface TransactionParams {
    to: string;
    from: string;
    value: string;
    gasLimit?: string;
    gasPrice?: string;
    data?: string;
  }
  
  interface WalletConnection {
    account: string;
    chainId: string;
  }
  
  export class WalletConnector {
    private provider: EthereumProvider | null = null;
    private account: string | null = null;
    private chainId: string | null = null;
  
    // Event handlers (optional)
    public onAccountChanged?: (account: string) => void;
    public onNetworkChanged?: (chainId: string) => void;
    public onDisconnected?: () => void;
  
      // Check if MetaMask is installed
  public isMetaMaskInstalled(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
  }
  
      // Detect MetaMask provider safely
  private getProvider(): EthereumProvider | null {
    if (!this.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    const ethereum = (window as any).ethereum as EthereumProvider;
    
    // Check for multiple wallet providers
    if (ethereum?.providers && ethereum.providers.length > 0) {
      // Find MetaMask specifically
      return ethereum.providers.find(
        (provider: EthereumProvider) => provider.isMetaMask
      ) || null;
    }

    return ethereum?.isMetaMask ? ethereum : null;
  }
  
      // Safe connection method
  public async connectWallet(): Promise<WalletConnection> {
    try {
      this.provider = this.getProvider();
      
      if (!this.provider) {
        throw new Error('MetaMask not found');
      }

      // Request account access
      const accounts: string[] = await this.provider.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      this.account = accounts[0];
      
      // Get current chain ID
      this.chainId = await this.provider.request({
        method: 'eth_chainId'
      });

      // Set up event listeners
      this.setupEventListeners();

      // Integrate with SIWE-based auth system
      if (this.account) {
        await this.authenticateWithServer();
      }

      return {
        account: this.account || '',
        chainId: this.chainId || ''
      };

    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }

  // Authenticate with the server via SIWE (sign-in with wallet)
  private async authenticateWithServer(): Promise<void> {
    if (!this.account) {
      throw new Error('No account to authenticate');
    }

    try {
      console.log('=== SIWE AUTHENTICATION START ===');
      console.log('Account to authenticate:', this.account);
      
      // Get nonce from server
      const nonceRes = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/nonce?address=${this.account}`);
      if (!nonceRes.ok) {
        const err = await nonceRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get nonce');
      }
      
      const { nonce, message } = await nonceRes.json();
      console.log('Received nonce:', nonce);
      console.log('Message to sign:', message);
      
      // Request signature from wallet
      const signature = await this.provider!.request({
        method: 'personal_sign',
        params: [message, this.account]
      });
      console.log('Signature received:', signature);
      
      // Verify signature with server
      const verifyRes = await fetch('${import.meta.env.VITE_BACKEND_URL}/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: this.account, signature, nonce })
      });

      console.log('Verification response status:', verifyRes.status);
      console.log('Verification response headers:', Object.fromEntries(verifyRes.headers.entries()));

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        console.error('Verification failed:', err);
        throw new Error(err.error || 'Verification failed');
      }

      const { user, session } = await verifyRes.json();
      console.log('=== SIWE AUTHENTICATION SUCCESS ===');
      console.log('User object received:', user);
      console.log('Session received:', session);
      
      if (!user || !session) {
        throw new Error('Verification did not return a user and session');
      }

      console.log('=== SIWE DEBUG START ===');
      console.log('Raw user object from server:', JSON.stringify(user, null, 2));
      console.log('User email field:', user.email);
      console.log('User walletAddress field:', user.walletAddress);
      console.log('User id field:', user.id);
      console.log('Original account:', this.account);
      console.log('Response verification:', verifyRes.status, verifyRes.statusText);
      
      // Extract the clean Ethereum address from the user object
      // The server returns user.email as "0x...@colosseum.app", but we need just "0x..."
      let cleanWalletAddress = this.account; // Use the original account as fallback
      
      console.log('Starting address extraction...');
      
      if (user.email && user.email.includes('@')) {
        // Extract the wallet address part before the @ symbol
        cleanWalletAddress = user.email.split('@')[0];
        console.log('✅ Extracted clean wallet address from email:', cleanWalletAddress);
      } else if (user.walletAddress && user.walletAddress.includes('@')) {
        // Try walletAddress field if email doesn't have it
        cleanWalletAddress = user.walletAddress.split('@')[0];
        console.log('✅ Extracted clean wallet address from walletAddress field:', cleanWalletAddress);
      } else if (user.walletAddress && !user.walletAddress.includes('@')) {
        // Use walletAddress if it's already clean
        cleanWalletAddress = user.walletAddress;
        console.log('✅ Using clean walletAddress from user object:', cleanWalletAddress);
      } else {
        console.log('⚠️ No @ symbol found in any field, using original account');
      }
      
      console.log('Final clean wallet address:', cleanWalletAddress);
      
      // Update the user object with the clean wallet address
      const cleanUser = {
        ...user,
        walletAddress: cleanWalletAddress,
        email: cleanWalletAddress // Also clean the email field
      };

      console.log('Final clean user object:', JSON.stringify(cleanUser, null, 2));
      console.log('=== SIWE DEBUG END ===');

      const { supabase } = await import('../supabase');
      const { setAuthData } = await import('../auth');
      await supabase.auth.setSession(session);
      setAuthData(cleanUser);
      console.log('Wallet connected via SIWE:', cleanUser.walletAddress);
    } catch (error) {
      console.error('Server authentication failed:', error);
      throw error;
    }
  }
  
    // Validate and switch to specific network
    public async switchToNetwork(targetChainId: string): Promise<void> {
      if (!this.provider) {
        throw new Error('Wallet not connected');
      }
  
      try {
        await this.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChainId }]
        });
      } catch (switchError: any) {
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          await this.addNetwork(targetChainId);
        } else {
          throw switchError;
        }
      }
    }
  
    // Add custom network (example for Polygon)
    public async addNetwork(chainId: string): Promise<void> {
      if (!this.provider) {
        throw new Error('Wallet not connected');
      }
  
      const networkConfigs: Record<string, NetworkConfig> = {
        '0x89': { // Polygon Mainnet
          chainId: '0x89',
          chainName: 'Polygon Mainnet',
          nativeCurrency: {
            name: 'MATIC',
            symbol: 'MATIC',
            decimals: 18
          },
          rpcUrls: ['https://polygon-rpc.com/'],
          blockExplorerUrls: ['https://polygonscan.com/']
        },
        '0xa4b1': { // Arbitrum One
          chainId: '0xa4b1',
          chainName: 'Arbitrum One',
          nativeCurrency: {
            name: 'ETH',
            symbol: 'ETH',
            decimals: 18
          },
          rpcUrls: ['https://arb1.arbitrum.io/rpc'],
          blockExplorerUrls: ['https://arbiscan.io/']
        }
        // Add other networks as needed
      };
  
      const config = networkConfigs[chainId];
      if (!config) {
        throw new Error('Unsupported network');
      }
  
      await this.provider.request({
        method: 'wallet_addEthereumChain',
        params: [config]
      });
    }
  
    // Set up event listeners for account/network changes
    private setupEventListeners(): void {
      if (!this.provider) return;
  
      // Account changed
      this.provider.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          this.disconnect();
        } else {
          this.account = accounts[0];
          this.onAccountChanged?.(accounts[0]);
        }
      });
  
      // Network changed
      this.provider.on('chainChanged', (chainId: string) => {
        this.chainId = chainId;
        this.onNetworkChanged?.(chainId);
        // Reload page to avoid stale state
        window.location.reload();
      });
  
      // Connection lost
      this.provider.on('disconnect', (error: any) => {
        console.log('Wallet disconnected:', error);
        this.disconnect();
      });
    }
  
    // Safe transaction signing
    public async signTransaction(transactionParams: TransactionParams): Promise<string> {
      if (!this.provider || !this.account) {
        throw new Error('Wallet not connected');
      }
  
      // Validate transaction parameters
      const validatedParams = this.validateTransactionParams(transactionParams);
  
      try {
        const txHash: string = await this.provider.request({
          method: 'eth_sendTransaction',
          params: [validatedParams]
        });
  
        return txHash;
      } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
      }
    }
  
    // Validate transaction parameters
    private validateTransactionParams(params: TransactionParams): TransactionParams {
      const required: (keyof TransactionParams)[] = ['to', 'from', 'value'];
      const validated: TransactionParams = { ...params };
  
      // Ensure required fields
      required.forEach(field => {
        if (!validated[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      });
  
      // Validate addresses
      if (!this.isValidAddress(validated.to)) {
        throw new Error('Invalid recipient address');
      }
  
      if (!this.isValidAddress(validated.from)) {
        throw new Error('Invalid sender address');
      }
  
      // Ensure sender matches connected account
      if (validated.from.toLowerCase() !== this.account?.toLowerCase()) {
        throw new Error('Sender address must match connected account');
      }
  
      // Validate value format
      if (validated.value && !validated.value.startsWith('0x')) {
        validated.value = '0x' + parseInt(validated.value).toString(16);
      }
  
      return validated;
    }
  
    // Simple address validation
    private isValidAddress(address: string): boolean {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
  
    // Safe message signing
    public async signMessage(message: string): Promise<string> {
      if (!this.provider || !this.account) {
        throw new Error('Wallet not connected');
      }
  
      try {
        const signature: string = await this.provider.request({
          method: 'personal_sign',
          params: [message, this.account]
        });
  
        return signature;
      } catch (error) {
        console.error('Message signing failed:', error);
        throw error;
      }
    }
  
    // Get account balance
    public async getBalance(): Promise<number> {
      if (!this.provider || !this.account) {
        throw new Error('Wallet not connected');
      }
  
      const balance: string = await this.provider.request({
        method: 'eth_getBalance',
        params: [this.account, 'latest']
      });
  
      // Convert from wei to ether
      return parseInt(balance, 16) / Math.pow(10, 18);
    }
  
    // Clean disconnection
    public disconnect(): void {
      this.provider = null;
      this.account = null;
      this.chainId = null;
      this.onDisconnected?.();
    }
  
    // Check connection status
    public isConnected(): boolean {
      return !!(this.provider && this.account);
    }
  
    // Get current account
    public getCurrentAccount(): string | null {
      return this.account;
    }
  
    // Get current chain ID
    public getCurrentChainId(): string | null {
      return this.chainId;
    }
  }
  
  // Create a singleton instance
  const walletConnector = new WalletConnector();
  
  export default walletConnector;
  
  // Rate limiter utility
  class RateLimiter {
    private lastRequest: number = 0;
    private minInterval: number = 1000; // 1 second between requests
  
    public canProceed(): boolean {
      const now = Date.now();
      if (now - this.lastRequest < this.minInterval) {
        throw new Error('Request rate limited');
      }
      this.lastRequest = now;
      return true;
    }
  }
  
  export const rateLimiter = new RateLimiter();
  
  // Trusted contracts whitelist
  export const TRUSTED_CONTRACTS: string[] = [
    // Add your contract addresses here
    // '0x1234567890123456789012345678901234567890',
  ];
  
  export function validateContractAddress(address: string): boolean {
    return TRUSTED_CONTRACTS.includes(address.toLowerCase());
  }