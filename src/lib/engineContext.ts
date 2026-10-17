import { createContext, useContext } from 'react';
import type { Engine } from '../gl/Engine';

export const EngineCtx = createContext<Engine | null>(null);
export const useEngine = () => useContext(EngineCtx);
