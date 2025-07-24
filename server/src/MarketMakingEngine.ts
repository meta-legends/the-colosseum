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
  static calculateTeamBattleOdds(v_a: BigNumber, v_b: BigNumber): { odds_a: BigNumber, odds_b: BigNumber, p_a: BigNumber, p_b: BigNumber } {
    const v_total = v_a.plus(v_b);

    // s is a smoothing factor. A larger s makes the odds less sensitive to the ratio of bets.
    // We adjust it based on total volume to make the market more volatile in early stages.
    // By reducing the divisor from 50 to 20, the smoothing effect diminishes more quickly,
    // making the odds more volatile and reactive to betting volume.
    const s = v_total.dividedBy(20);

    const p_a = v_b.plus(s).dividedBy(v_a.plus(v_b).plus(s.times(2)));
    const p_b = v_a.plus(s).dividedBy(v_a.plus(v_b).plus(s.times(2)));

    // Calculate initial odds based on these smoothed probabilities
    let odds_a = new BigNumber(1).dividedBy(p_a);
    let odds_b = new BigNumber(1).dividedBy(p_b);

    // Step 2: Market Making Adjustment (Inverted Smoothing)
    // By reducing the divisor from 50 to 20, the smoothing effect diminishes more quickly,
    // making the odds more volatile and reactive to betting volume.
    const p1_adj = p_a.times(new BigNumber(1).minus(s)).plus(new BigNumber(0.5).times(s));
    const p2_adj = p_b.times(new BigNumber(1).minus(s)).plus(new BigNumber(0.5).times(s));

    // Step 3 & 4: Liquidity-Constrained Odds & House Edge
    const max_safe_odds1 = v_a.isZero()
      ? MAX_ODDS_TEAM_BATTLE
      : v_b.times(SAFETY_BUFFER).dividedBy(v_a.times(new BigNumber(1).minus(F_HOUSE)));
    
    const max_safe_odds2 = v_b.isZero()
      ? MAX_ODDS_TEAM_BATTLE
      : v_a.times(SAFETY_BUFFER).dividedBy(v_b.times(new BigNumber(1).minus(F_HOUSE)));

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

    return { odds_a: final_odds1, odds_b: final_odds2, p_a: p_a, p_b: p_b };
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