# The Colosseum V0.1 - Product Requirements Document

## 1. Executive Summary

**Product Name:** The Colosseum V0.1 (Functional Draft)  
**Version:** 0.1.0  
**Target:** Local testing and validation  
**Development Approach:** Robust, modular foundation prioritizing stability over aesthetics  
**Timeline:** 4-6 weeks development  

### 1.1 Core Objective
Build a stable, functional foundation for a live battle streaming platform with integrated betting, focusing on core mechanics without complex features. This version serves as a technical proof-of-concept and foundation for future iterations.

## 2. Technical Architecture

### 2.1 Technology Stack

**Frontend:**
- **Framework:** Vanilla TypeScript with modern ES modules
- **Styling:** Pure CSS with CSS Custom Properties (no frameworks)
- **Build Tool:** Vite for development and bundling
- **Module System:** ES6 modules with clear separation of concerns

**Backend:**
- **Runtime:** Node.js with Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Real-time:** Socket.io for chat and live updates
- **Video Streaming:** HLS (HTTP Live Streaming) with Video.js player
- **Blockchain Integration:** Ethers.js for Metamask integration

**Development Tools:**
- **TypeScript:** Strict mode enabled
- **Linting:** ESLint with strict TypeScript rules
- **Testing:** Jest for unit tests, Playwright for E2E
- **Code Formatting:** Prettier
- **Version Control:** Git with conventional commits

### 2.2 Architecture Principles

1. **Modular Design:** Each feature as independent module with clear interfaces
2. **Separation of Concerns:** Distinct layers for UI, business logic, and data
3. **Type Safety:** Full TypeScript coverage with strict types
4. **Error Handling:** Comprehensive error boundaries and fallbacks
5. **Performance:** Lazy loading and efficient state management
6. **Maintainability:** Clear naming conventions and documentation

## 3. Feature Specifications

### 3.1 Authentication System

**Requirements:**
- Metamask-only integration for V0.1
- Wallet address as unique user identifier
- Persistent session management
- Connection state monitoring

**Technical Implementation:**
```typescript
interface User {
  walletAddress: string;
  connectedAt: Date;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isConnecting: boolean;
  error: string | null;
}
```

**User Flow:**
1. User clicks "Connect Wallet"
2. Metamask popup appears
3. User approves connection
4. Wallet address stored as user identifier
5. User gains access to betting and chat features

### 3.2 Video Player System

**Requirements:**
- HLS video streaming support
- Global synchronization (all users see same timestamp)
- No pause/play controls for users
- Volume control and mute functionality
- Backend-controlled start time

**Technical Specifications:**
- **Video Format:** HLS (.m3u8 playlist)
- **Player:** Video.js with HLS.js plugin
- **Synchronization:** WebSocket-based time sync every 5 seconds
- **Controls:** Volume slider (0-100%), mute toggle only

**Implementation:**
```typescript
interface VideoState {
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  streamUrl: string;
}

interface VideoControls {
  setVolume(level: number): void;
  toggleMute(): void;
  // No play/pause methods exposed
}
```

### 3.3 Live Chat System

**Requirements:**
- Real-time messaging via WebSocket
- User identification by wallet address (truncated display)
- Message history (last 100 messages)
- Basic message validation and sanitization
- No moderation features in V0.1

**Message Schema:**
```typescript
interface ChatMessage {
  id: string;
  walletAddress: string;
  message: string;
  timestamp: Date;
  messageType: 'user' | 'system';
}
```

**Features:**
- Real-time message display
- Auto-scroll to latest messages
- Character limit: 200 characters per message
- Rate limiting: 1 message per 2 seconds per user

### 3.4 Betting System

**Core Mechanics:**
- Two-constituent betting (A vs B)
- Pool-based odds calculation
- Real-time odds and payout updates
- Bet locking mechanism before battle starts

**Betting Pool Logic:**
```typescript
interface BettingPool {
  constituentA: {
    totalAmount: number;
    betCount: number;
    name: string;
  };
  constituentB: {
    totalAmount: number;
    betCount: number;
    name: string;
  };
  isOpen: boolean;
  battleId: string;
}

interface UserBet {
  id: string;
  userWallet: string;
  constituentChoice: 'A' | 'B';
  amount: number;
  estimatedPayout: number;
  odds: number;
  placedAt: Date;
}
```

**Odds Calculation:**
```
Odds for A = (Total Pool) / (Amount on A)
Odds for B = (Total Pool) / (Amount on B)
User Payout = (User Bet Amount) × (Odds at time of bet)
```

**Betting States:**
1. **Open:** Users can place bets
2. **Locked:** No new bets (30 seconds before battle)
3. **Resolved:** Battle complete, payouts calculated

## 4. UI/UX Requirements

### 4.1 Color Palette

**Primary Colors:**
- **Limestone:** #F5F5DC (backgrounds, cards)
- **Beige:** #E8DCC6 (secondary backgrounds)
- **Brown:** #8B7355 (text, borders)
- **Accent Orange:** #FF6B35 (CTAs, highlights)
- **Dark Brown:** #5D4E37 (primary text)

**Usage Guidelines:**
- Limestone for main backgrounds
- Beige for component backgrounds
- Brown for borders and secondary text
- Orange for buttons, active states, betting amounts
- Dark brown for primary text and headings

### 4.2 Layout Structure

**Desktop Layout (1200px+):**
```
┌─────────────────────────────────────────────────────┐
│ Header: Logo | Wallet Status | Connection Info      │
├─────────────┬───────────────────────┬───────────────┤
│ CHAT (25%)  │ VIDEO PLAYER (50%)    │ BETTING (25%) │
│             │                       │               │
│ Messages    │ [Video Stream]        │ Constituent A │
│ Input       │ Volume Controls       │ Constituent B │
│             │ Sync Status          │ Bet Amount    │
│             │                       │ Place Bet     │
│             │                       │ Odds Display  │
└─────────────┴───────────────────────┴───────────────┘
```

**Component Hierarchy:**
- App Container
  - Header (Logo, Wallet Connection)
  - Main Layout
    - Chat Panel
    - Video Panel
    - Betting Panel

### 4.3 Component Specifications

**Button Styles:**
- Primary: Orange background, white text, 8px border radius
- Secondary: Brown outline, brown text
- Disabled: Beige background, gray text

**Input Fields:**
- Background: White with beige border
- Focus: Orange border
- Error: Red border with error message

**Cards:**
- Background: Beige
- Border: 1px solid brown
- Border radius: 12px
- Shadow: Subtle brown shadow

## 5. Backend Requirements

### 5.1 Database Schema

**Users Table:**
```sql
CREATE TABLE users (
  wallet_address VARCHAR(42) PRIMARY KEY,
  first_connected_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);
```

**Battles Table:**
```sql
CREATE TABLE battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituent_a_name VARCHAR(100) NOT NULL,
  constituent_b_name VARCHAR(100) NOT NULL,
  video_url TEXT NOT NULL,
  scheduled_start_time TIMESTAMP NOT NULL,
  actual_start_time TIMESTAMP,
  status VARCHAR(20) DEFAULT 'scheduled',
  winning_constituent CHAR(1), -- 'A' or 'B'
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Bets Table:**
```sql
CREATE TABLE bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID REFERENCES battles(id),
  user_wallet VARCHAR(42) REFERENCES users(wallet_address),
  constituent_choice CHAR(1) NOT NULL, -- 'A' or 'B'
  amount DECIMAL(18,8) NOT NULL,
  odds_at_bet DECIMAL(10,4) NOT NULL,
  estimated_payout DECIMAL(18,8) NOT NULL,
  actual_payout DECIMAL(18,8),
  placed_at TIMESTAMP DEFAULT NOW(),
  is_winning BOOLEAN
);
```

**Chat Messages Table:**
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID REFERENCES battles(id),
  user_wallet VARCHAR(42) REFERENCES users(wallet_address),
  message TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.2 API Endpoints

**Authentication:**
- `POST /api/auth/connect` - Connect wallet
- `GET /api/auth/status` - Check connection status
- `POST /api/auth/disconnect` - Disconnect wallet

**Battle Management:**
- `GET /api/battles/current` - Get current active battle
- `GET /api/battles/:id` - Get specific battle details
- `GET /api/battles/:id/pool` - Get current betting pool state

**Betting:**
- `GET /api/bets/user/:wallet` - Get user's bets for current battle
- `POST /api/bets/place` - Place a new bet
- `GET /api/bets/odds/:battleId` - Get current odds

**Chat:**
- `GET /api/chat/:battleId/messages` - Get recent messages
- WebSocket: `/chat` - Real-time messaging

**Video:**
- `GET /api/video/sync/:battleId` - Get current video timestamp
- WebSocket: `/video-sync` - Real-time synchronization

### 5.3 WebSocket Events

**Chat Events:**
```typescript
// Client → Server
interface SendMessageEvent {
  type: 'send_message';
  battleId: string;
  message: string;
}

// Server → Client
interface NewMessageEvent {
  type: 'new_message';
  message: ChatMessage;
}
```

**Betting Events:**
```typescript
// Server → Client
interface PoolUpdateEvent {
  type: 'pool_update';
  battleId: string;
  pool: BettingPool;
}

interface BetPlacedEvent {
  type: 'bet_placed';
  battleId: string;
  totalA: number;
  totalB: number;
  newOdds: { A: number; B: number };
}
```

**Video Sync Events:**
```typescript
// Server → Client
interface VideoSyncEvent {
  type: 'video_sync';
  currentTime: number;
  isPlaying: boolean;
  timestamp: number;
}
```

## 6. Code Organization

### 6.1 Frontend Structure
```
src/
├── components/
│   ├── Chat/
│   │   ├── ChatPanel.ts
│   │   ├── MessageList.ts
│   │   └── MessageInput.ts
│   ├── Video/
│   │   ├── VideoPlayer.ts
│   │   └── VolumeControls.ts
│   ├── Betting/
│   │   ├── BettingPanel.ts
│   │   ├── ConstituentCard.ts
│   │   └── BetForm.ts
│   └── Auth/
│       └── WalletConnect.ts
├── services/
│   ├── api.ts
│   ├── websocket.ts
│   ├── wallet.ts
│   └── video.ts
├── types/
│   ├── auth.ts
│   ├── betting.ts
│   ├── chat.ts
│   └── video.ts
├── utils/
│   ├── formatting.ts
│   ├── validation.ts
│   └── constants.ts
└── styles/
    ├── globals.css
    ├── components.css
    └── variables.css
```

### 6.2 Backend Structure
```
server/
├── routes/
│   ├── auth.ts
│   ├── battles.ts
│   ├── bets.ts
│   └── chat.ts
├── services/
│   ├── BettingService.ts
│   ├── ChatService.ts
│   ├── VideoSyncService.ts
│   └── WalletService.ts
├── middleware/
│   ├── auth.ts
│   ├── validation.ts
│   └── rateLimit.ts
├── websocket/
│   ├── chatHandler.ts
│   ├── bettingHandler.ts
│   └── videoSyncHandler.ts
└── database/
    ├── schema.sql
    ├── migrations/
    └── seeds/
```

## 7. Development Guidelines

### 7.1 TypeScript Standards
- Strict mode enabled
- No `any` types allowed
- All functions must have return type annotations
- Interfaces for all data structures
- Enums for string constants

### 7.2 Error Handling
```typescript
// Service layer error handling
class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Component error boundaries
interface ErrorState {
  hasError: boolean;
  error: Error | null;
}
```

### 7.3 State Management
- No external state management libraries
- Component-level state with clear data flow
- Service layer for shared state (WebSocket connections)
- Event-driven updates for real-time features

### 7.4 Testing Strategy
- Unit tests for all utility functions
- Integration tests for API endpoints
- E2E tests for critical user flows
- WebSocket connection testing
- Metamask integration mocking

## 8. Security Requirements

### 8.1 Authentication Security
- Wallet signature verification
- Session timeout after 24 hours
- Connection state validation
- CSRF protection on all endpoints

### 8.2 Betting Security
- Bet amount validation (min/max limits)
- Double-spend prevention
- Race condition handling for bet placement
- Audit trail for all betting actions

### 8.3 Chat Security
- Message sanitization
- Rate limiting (1 message/2 seconds)
- Character limits (200 chars)
- XSS prevention

## 9. Performance Requirements

### 9.1 Frontend Performance
- Initial load time: < 3 seconds
- Component rendering: < 100ms
- WebSocket message handling: < 50ms
- Memory usage: < 100MB

### 9.2 Backend Performance
- API response time: < 200ms
- WebSocket message broadcast: < 100ms
- Database query time: < 50ms
- Concurrent users: 100+ (for V0.1 testing)

## 10. Testing & Deployment

### 10.1 Local Development Setup
```bash
# Frontend
npm install
npm run dev

# Backend
npm install
npm run migrate
npm run seed
npm run dev

# Full stack
docker-compose up
```

### 10.2 Testing Checklist
- [ ] Metamask connection/disconnection
- [ ] Video synchronization across multiple clients
- [ ] Real-time chat functionality
- [ ] Bet placement and odds calculation
- [ ] Error handling and edge cases
- [ ] Mobile responsiveness
- [ ] Cross-browser compatibility

### 10.3 Success Metrics for V0.1
- Stable Metamask integration (100% connection success)
- Video sync accuracy (< 1 second drift)
- Chat message delivery (< 100ms latency)
- Betting calculations (100% accuracy)
- Zero crashes during 1-hour testing sessions
- Support for 10+ concurrent users

## 11. Future Considerations

### 11.1 Scalability Preparation
- Database indexing strategy
- Caching layer implementation points
- WebSocket clustering readiness
- CDN integration for video delivery

### 11.2 Feature Extension Points
- **Supabase Integration:** Implementation of Supabase as the backend service for traditional email/password authentication system with associated wallet functionality
- **Wallet Association System:** Infrastructure for linking multiple wallets to email-based accounts
- **Additional Wallet Support:** Extension points for supporting other Web3 wallets beyond Metamask
- **Advanced Betting Mechanics:** Integration points for the complex betting mechanics outlined in the provided documentation
- **Third-party Integrations:** API design considerations for external service integrations

This V0.1 PRD provides a solid foundation for building a robust, testable version of The Colosseum while maintaining the flexibility to add complex features in future iterations.