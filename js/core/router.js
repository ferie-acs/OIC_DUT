import { getCurrentUser } from './auth.js';
import { can } from './permissions.js';

const routes = [];
let notFoundHandler = () => {};
let onRouteChange = () => {};

export function registerRoute(pattern, handler, options = {}) {
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
    handler,
    permission: options.permission || null,
    public: options.public || false,
  });
}

export function setNotFoundHandler(fn) {
  notFoundHandler = fn;
}

export function setRouteChangeListener(fn) {
  onRouteChange = fn;
}

export function navigate(path) {
  window.location.hash = path;
}

function currentPath() {
  const hash = window.location.hash || '#/login';
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

export function getCurrentPath() {
  return currentPath();
}

function resolve() {
  const path = currentPath() || '/login';
  const user = getCurrentUser();

  for (const route of routes) {
    const match = path.match(route.regex);
    if (!match) continue;
    const params = {};
    route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });

    if (!route.public && !user) {
      navigate('/login');
      return;
    }
    // Intégration : une route peut accepter plusieurs droits (l'un d'eux suffit), par exemple lecture ou déclaration.
    if (route.permission && ![].concat(route.permission).some((p) => can(user, p))) {
      notFoundHandler({ reason: 'forbidden', path });
      return;
    }
    onRouteChange(path);
    route.handler(params);
    return;
  }
  notFoundHandler({ reason: 'not_found', path });
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  window.addEventListener('storage', event => { if (!event.key || ['dut_users','dut_current_user','dut_settings_v1'].includes(event.key)) resolve(); });
  resolve();
}
