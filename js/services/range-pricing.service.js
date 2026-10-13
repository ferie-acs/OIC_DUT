// Lot d2 : tarifs des références (numéros DUT). Le prix unitaire et la quantité proposée restent
// dans les paramètres de la plateforme ; la TVA, le droit de timbre et la dotation d'antenne sont ici.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { settings } from './settings.service.js';
import { saveSettings } from './admin.service.js';
import { readPricing, writePricing } from '../repositories/range-stock.repository.js';
import * as auditService from './audit.service.js';

export const PRICING_DEFAULTS = { tvaRate: 18, stamp: 100, antennaQuantity: 500 };

/** Tarifs en vigueur : prix HT par numéro, TVA (%), droit de timbre par vente, quantités proposées. */
export function pricing() {
  const s = settings();
  const p = { ...PRICING_DEFAULTS, ...readPricing() };
  return { unitHT: Number(s.rangePrice), quantity: Number(s.rangeQuantity), tvaRate: Number(p.tvaRate), stamp: Number(p.stamp), antennaQuantity: Number(p.antennaQuantity) };
}

/** Montants d'une vente de `quantity` numéros, figés au moment de la vente. */
export function amountsFor(quantity, pr = pricing()) {
  const qty = Math.max(0, Number(quantity) || 0);
  const ht = Math.round(qty * (Number(pr.unitHT) || 0));
  const tva = Math.round(ht * (Number(pr.tvaRate) || 0) / 100);
  const stamp = qty > 0 ? Math.round(Number(pr.stamp) || 0) : 0;
  return { quantity: qty, unitHT: Number(pr.unitHT) || 0, tvaRate: Number(pr.tvaRate) || 0, ht, tva, stamp, ttc: ht + tva + stamp };
}

export function savePricing(values) {
  const user = getCurrentUser();
  if (!can(user, 'ranges.settings')) throw new Error('Seul un administrateur OIC peut modifier les tarifs.');
  const v = {
    rangePrice: Number(values.unitHT), rangeQuantity: Number(values.quantity),
    tvaRate: Number(values.tvaRate), stamp: Number(values.stamp), antennaQuantity: Number(values.antennaQuantity),
  };
  if (!Number.isFinite(v.tvaRate) || v.tvaRate < 0 || v.tvaRate > 100) throw new Error('Le taux de TVA doit être compris entre 0 et 100 %.');
  if (!Number.isInteger(v.stamp) || v.stamp < 0 || v.stamp > 100000) throw new Error('Le droit de timbre doit être un montant entier entre 0 et 100 000 FCFA.');
  if (!Number.isInteger(v.antennaQuantity) || v.antennaQuantity < 1 || v.antennaQuantity > 50000) throw new Error('La dotation d’antenne doit être comprise entre 1 et 50 000 numéros.');
  const before = pricing();
  saveSettings({ ...settings(), rangePrice: v.rangePrice, rangeQuantity: v.rangeQuantity });
  writePricing({ tvaRate: v.tvaRate, stamp: v.stamp, antennaQuantity: v.antennaQuantity });
  const after = pricing();
  auditService.log(AUDIT_ACTIONS.RANGE_SETTINGS_UPDATED, { oldValue: JSON.stringify(before), newValue: JSON.stringify(after), note: `Prix HT ${after.unitHT} F · TVA ${after.tvaRate} % · timbre ${after.stamp} F · dotation ${after.antennaQuantity}` });
  return after;
}
