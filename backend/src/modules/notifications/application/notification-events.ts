import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { AppConfigService } from '@/platform/config/app-config.service.js';

export interface NotificationEvent { userId: string; notificationId: string; householdId: string }

class EventQueue<T> implements AsyncIterableIterator<T> {
  private values: T[] = [];
  private waiters: Array<(result: IteratorResult<T>) => void> = [];
  private ended = false;
  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else { this.values.push(value); if (this.values.length > 20) this.values.shift(); }
  }
  next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) return Promise.resolve({ value, done: false });
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  async return(): Promise<IteratorResult<T>> { this.ended = true; for (const resolve of this.waiters.splice(0)) resolve({ value: undefined, done: true }); return { value: undefined, done: true }; }
  [Symbol.asyncIterator](): AsyncIterableIterator<T> { return this; }
}

@Injectable()
export class NotificationEvents implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEvents.name);
  private readonly listeners = new Map<string, Set<EventQueue<NotificationEvent>>>();
  private client?: pg.Client;
  private stopping = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> { await this.connect(); }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const client = this.client;
    this.client = undefined;
    if (client) { client.removeAllListeners(); await client.end().catch(() => undefined); }
    for (const queues of this.listeners.values()) for (const queue of queues) await queue.return();
    this.listeners.clear();
  }

  subscribe(userId: string): AsyncIterableIterator<NotificationEvent> {
    const queue = new EventQueue<NotificationEvent>();
    const listeners = this.listeners.get(userId) ?? new Set<EventQueue<NotificationEvent>>();
    listeners.add(queue);
    this.listeners.set(userId, listeners);
    const originalReturn = queue.return.bind(queue);
    queue.return = async () => {
      listeners.delete(queue);
      if (!listeners.size) this.listeners.delete(userId);
      return originalReturn();
    };
    return queue;
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;
    const client = new pg.Client({ connectionString: this.config.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query('LISTEN notification_received');
      client.on('notification', (message) => {
        if (message.channel !== 'notification_received' || !message.payload) return;
        try {
          const event = JSON.parse(message.payload) as NotificationEvent;
          if (!event.userId || !event.notificationId || !event.householdId) return;
          for (const queue of this.listeners.get(event.userId) ?? []) queue.push(event);
        } catch { this.logger.warn('Discarded malformed notification event'); }
      });
      client.on('error', (error) => { this.logger.warn(`Notification LISTEN connection failed: ${error.message}`); this.scheduleReconnect(client); });
      client.on('end', () => this.scheduleReconnect(client));
      this.client = client;
    } catch (error) {
      await client.end().catch(() => undefined);
      this.logger.warn(`Notification LISTEN connection unavailable: ${(error as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(client?: pg.Client): void {
    if (client && this.client !== client) return;
    if (this.client === client) this.client = undefined;
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.connect(); }, 3000);
  }
}
