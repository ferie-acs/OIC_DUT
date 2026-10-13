import { getAllAntennas, findAntennaById } from '../repositories/antennas.repository.js';
import { getAllPartners, findPartnerById } from '../repositories/partners.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';

// Lot d2 : une antenne fermée disparaît de la carte et des postes de contrôle.
export function listAntennas() { return getAllAntennas().filter((a) => a.status !== 'CLOSED'); }
export function getAntenna(id) { return findAntennaById(id); }
export function listPartners() { return getAllPartners(); }
export function getPartner(id) { return findPartnerById(id); }
export function listUsers() { return getAllUsers(); }
