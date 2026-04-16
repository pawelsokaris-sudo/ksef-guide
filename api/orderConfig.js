/**
 * Order configuration: scenario → products mapping
 *
 * towarKod values from Sapio TOWARY table:
 *   54  = Faktura-NT roczna
 *   380 = KSeF Smart roczna
 *
 * Pricing is ALWAYS fetched from Sapio products/pricing at order time.
 * No hardcoded prices here — only product codes.
 */
const SCENARIO_PRODUCTS = {
  'A': [
    { towarKod: 54, label: 'Faktura-NT — licencja roczna' },
    { towarKod: 380, label: 'KSeF Smart — licencja roczna' },
  ],
  'B': [
    { towarKod: 54, label: 'Faktura-NT — licencja roczna (migracja z Fakturant)' },
    { towarKod: 380, label: 'KSeF Smart — licencja roczna' },
  ],
  // C = already has everything, no order needed
  'D': [
    { towarKod: 380, label: 'KSeF Smart — licencja roczna' },
  ],
  'E': [
    { towarKod: 54, label: 'Faktura-NT — odnowienie aktualizacji rocznej' },
    { towarKod: 380, label: 'KSeF Smart — licencja roczna' },
  ],
  'F': [
    { towarKod: 380, label: 'KSeF Smart — licencja roczna (do Faktura-JPK)' },
  ],
  'G': [
    { towarKod: 380, label: 'KSeF Smart — licencja roczna (do Sapio)' },
  ],
  // H = service unavailable, contact form only — no order
};

/**
 * Get products for a scenario.
 * Returns null if scenario doesn't support ordering (C, H).
 */
function getProductsForScenario(scenario) {
  return SCENARIO_PRODUCTS[scenario] || null;
}

module.exports = { SCENARIO_PRODUCTS, getProductsForScenario };
