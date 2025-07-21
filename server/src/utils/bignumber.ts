import BigNumber from 'bignumber.js';

// Configure BigNumber for high precision
BigNumber.config({
  DECIMAL_PLACES: 18, // Standard for many crypto applications
  EXPONENTIAL_AT: 1e+9,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
});

export default BigNumber; 