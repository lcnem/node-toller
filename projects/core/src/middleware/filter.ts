import { AllowList } from '../types';

export function filter(allowList: AllowList, path: string, method: string) {
  if (path.startsWith('/node-toller')) {
    return true;
  }
  for (const allow of allowList) {
    if (path.match(allow.path) && method.toUpperCase() === allow.method) {
      return true;
    }
  }

  return false;
}
