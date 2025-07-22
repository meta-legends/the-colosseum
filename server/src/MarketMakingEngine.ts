import BigNumber from './utils/bignumber';
import { F_HOUSE, MAX_ODDS_BATTLE_ROYALE, MAX_ODDS_TEAM_BATTLE, MIN_ODDS, SAFETY_BUFFER } from './constants';

/**
 * Implements the market making algorithms for calculating odds.
 */
export class MarketMakingEngine {

  /**
   * Calculates odds for a 2-team battle (Algorithm 1).
   * @param v1 - Total volume bet on Team 1.
   * @param v2 - Total volume bet on Team 2.
   * @returns The calculated odds for Team 1 and Team 2.
   */
  static calculateTeamBattleOdds(
    v1: BigNumber,
    v2: BigNumber
  ): { odds1: BigNumber; odds2: BigNumber } {
    const v_total = v1.plus(v2);

    // Step 0: Handle initial conditions
    if (v_total.isZero()) {
      const initialProb = new BigNumber('0.5').times(new BigNumber(1).minus(F_HOUSE));
      const initialOdds = new BigNumber(1).dividedBy(initialProb);
      return {
        odds1: BigNumber.min(MAX_ODDS_TEAM_BATTLE, BigNumber.max(MIN_ODDS, initialOdds)),
        odds2: BigNumber.min(MAX_ODDS_TEAM_BATTLE, BigNumber.max(MIN_ODDS, initialOdds)),
      };
    }

    // Step 1: Base Probability Calculation
    const p1_base = v2.dividedBy(v_total);
    const p2_base = v1.dividedBy(v_total);

    // Step 2: Market Making Adjustment (Inverted Smoothing)
    const s = BigNumber.max(0.05, new BigNumber(0.3).minus(v_total.dividedBy(50)));
    
    const p1_adj = p1_base.times(new BigNumber(1).minus(s)).plus(new BigNumber(0.5).times(s));
    const p2_adj = p2_base.times(new BigNumber(1).minus(s)).plus(new BigNumber(0.5).times(s));

    // Step 3 & 4: Liquidity-Constrained Odds & House Edge
    const max_safe_odds1 = v1.isZero()
      ? MAX_ODDS_TEAM_BATTLE
      : v2.times(SAFETY_BUFFER).dividedBy(v1.times(new BigNumber(1).minus(F_HOUSE)));
    
    const max_safe_odds2 = v2.isZero()
      ? MAX_ODDS_TEAM_BATTLE
      : v1.times(SAFETY_BUFFER).dividedBy(v2.times(new BigNumber(1).minus(F_HOUSE)));

    // Step 5: Convert to Decimal Odds
    const p1_final = p1_adj.times(new BigNumber(1).minus(F_HOUSE));
    const p2_final = p2_adj.times(new BigNumber(1).minus(F_HOUSE));

    const market_odds1 = new BigNumber(1).dividedBy(p1_final);
    const market_odds2 = new BigNumber(1).dividedBy(p2_final);

    let final_odds1 = BigNumber.min(market_odds1, max_safe_odds1);
    let final_odds2 = BigNumber.min(market_odds2, max_safe_odds2);

    // Step 6: Bounds Checking
    final_odds1 = BigNumber.min(MAX_ODDS_TEAM_BATTLE, BigNumber.max(MIN_ODDS, final_odds1));
    final_odds2 = BigNumber.min(MAX_ODDS_TEAM_BATTLE, BigNumber.max(MIN_ODDS, final_odds2));

    return { odds1: final_odds1, odds2: final_odds2 };
  }

  /**
   * Calculates odds for a multi-participant battle royale (Algorithm 2).
   * @param volumes - A map of characterId to the total volume bet on them.
   * @returns A map of characterId to their calculated odds.
   */
  static calculateBattleRoyaleOdds(
    volumes: Map<string, BigNumber>
  ): Map<string, BigNumber> {
    const characterIds = Array.from(volumes.keys());
    const n = new BigNumber(characterIds.length);
    const v_total = Array.from(volumes.values()).reduce((acc, vol) => acc.plus(vol), new BigNumber(0));

    // Step 0: Handle initial conditions
    if (v_total.isZero()) {
      const initialOdds = n.times(new BigNumber(1).minus(F_HOUSE));
      const boundedInitialOdds = BigNumber.min(MAX_ODDS_BATTLE_ROYALE, BigNumber.max(MIN_ODDS, initialOdds));
      const oddsMap = new Map<string, BigNumber>();
      characterIds.forEach(id => oddsMap.set(id, boundedInitialOdds));
      return oddsMap;
    }

    // Step 1: Base Probability (Equal for All)
    const p_base = new BigNumber(1).dividedBy(n);

    // Step 3: Market-Implied Probability Calculation (Dynamic Smoothing)
    const marketProbabilities = new Map<string, BigNumber>();
    let total_inverse_volume = new BigNumber(0);

    for (const id of characterIds) {
      const v_i = volumes.get(id) || new BigNumber(0);
      const inverse_volume_i = BigNumber.max(0.1, v_total.minus(v_i).plus(1));
      marketProbabilities.set(id, inverse_volume_i); // Store temporarily
      total_inverse_volume = total_inverse_volume.plus(inverse_volume_i);
    }
    
    for (const id of characterIds) {
        const inverse_volume_i = marketProbabilities.get(id)!;
        const p_market_i = inverse_volume_i.dividedBy(total_inverse_volume);
        marketProbabilities.set(id, p_market_i);
    }
    
    // Step 4: Combined Probability (Dynamic Weighted Average)
    const smoothing_weight = BigNumber.max(0.05, new BigNumber(0.3).minus(v_total.dividedBy(50)));
    const finalOdds = new Map<string, BigNumber>();

    for (const id of characterIds) {
        const p_market_i = marketProbabilities.get(id)!;
        const p_combined_i = p_base.times(smoothing_weight).plus(p_market_i.times(new BigNumber(1).minus(smoothing_weight)));
        
        // Step 5: House Edge & Convert to Decimal Odds
        const p_final_i = p_combined_i.times(new BigNumber(1).minus(F_HOUSE));
        const odds_i = new BigNumber(1).dividedBy(p_final_i);

        // Step 6: Bounds Checking
        const bounded_odds = BigNumber.min(MAX_ODDS_BATTLE_ROYALE, BigNumber.max(MIN_ODDS, odds_i));
        finalOdds.set(id, bounded_odds);
    }

    return finalOdds;
  }
} 