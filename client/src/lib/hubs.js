import * as signalR from '@microsoft/signalr';
import { hubUrl } from './config';
import { useAuthStore } from '../store/authStore';

/** Authenticated SignalR connection (JWT goes in the query string — browsers can't set WS headers). */
export function buildHub(name) {
  return new signalR.HubConnectionBuilder()
    .withUrl(hubUrl(name), { accessTokenFactory: () => useAuthStore.getState().token || '' })
    .withAutomaticReconnect([0, 1500, 4000, 10000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}

export { signalR };
