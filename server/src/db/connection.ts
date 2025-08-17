import { PrismaClient } from '@prisma/client';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private prisma: PrismaClient;
  private isConnected: boolean = false;

  private constructor() {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public getClient(): PrismaClient {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.prisma.$connect();
        this.isConnected = true;
        console.log('✅ Database connected successfully');
      } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.prisma.$disconnect();
        this.isConnected = false;
        console.log('✅ Database disconnected successfully');
      } catch (error) {
        console.error('❌ Database disconnection failed:', error);
        throw error;
      }
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  public isHealthy(): boolean {
    return this.isConnected;
  }
}

// Export the singleton instance
export const dbConnection = DatabaseConnection.getInstance();

// Export the Prisma client for direct use
export const prisma = dbConnection.getClient();

// Export the connection class for testing purposes
export { DatabaseConnection };

