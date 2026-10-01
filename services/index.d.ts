import type { Express, RequestHandler } from 'express';

export type MaybePromise<T> = T | Promise<T>;

export type RichWindErrorCode =
  | 'INVALID_ID'
  | 'MISSING_INPUT'
  | 'INVALID_BODY'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'READ_ONLY_REPLICA'
  | 'RATE_LIMITED'
  | 'SERVER_BUSY'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'REQUEST_BLOCKED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export type NormalizedBundle = 'full' | 'base' | 'theme' | 'utilities';

export type Bundle = NormalizedBundle;

export type NodeRole = 'hybrid' | 'writer' | 'reader' | 'write' | 'read';

export interface CoreConfig {
  maxBodyBytes: number;
  maxHtmlChars: number;
  maxClassChars: number;
  maxClassCount: number;
  maxIdLength: number;
  suggestLimit: number;
  suggestFallback: boolean;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  rateLimitDisabled: boolean;
  trustProxy: boolean;
  cacheMaxPages: number;
  cacheTtlMs: number;
  projectCacheTtlMs: number;
  corsOrigin: '*' | string[] | null;
  maxCssChars: number;
  nodeRole: 'hybrid' | 'writer' | 'reader';
}

export interface CoreConfigInput {
  maxBodyBytes?: number | string;
  maxHtmlChars?: number | string;
  maxClassChars?: number | string;
  maxClassCount?: number | string;
  maxIdLength?: number | string;
  suggestLimit?: number | string;
  suggestFallback?: boolean | string;
  rateLimitWindowMs?: number | string;
  rateLimitMax?: number | string;
  rateLimitDisabled?: boolean | string;
  trustProxy?: boolean | string;
  cacheMaxPages?: number | string;
  cacheTtlMs?: number | string;
  projectCacheTtlMs?: number | string;
  corsOrigin?: string | string[] | null;
  maxCssChars?: number | string;
  nodeRole?: NodeRole | string;
}

export interface PluginRequestMeta {
  ip: string;
  method: string;
  path: string;
}

export interface PluginGuardResult {
  blocked: boolean;
  error?: string;
  status?: number;
  retryAfter?: number | string;
}

export interface PluginGuardContext extends PluginContext, PluginRequestMeta {}

export type PluginSource =
  | 'http'
  | 'plugin'
  | 'cache-store'
  | 'page'
  | 'page-store'
  | 'store'
  | string;

export interface PluginResolveResult {
  css: string;
}

export interface CompileInput {
  projectId: string;
  pageId: string;
  html?: string;
  classes?: string | string[];
  bundle?: Bundle;
}

export interface CompileSuccessResult {
  css: string;
  classes: string[];
  /** Invalid or unsafe normalized tokens supplied through `classes`, never HTML scanner candidates. */
  rejected: string[];
  hash: string;
  cached: boolean;
  bundle: NormalizedBundle;
}

export interface CompileErrorResult {
  error: string;
  status: number;
  code?: string;
  classes?: string[];
  css?: string;
}

export type CompileResult = CompileSuccessResult | CompileErrorResult;

export interface PageArtifact {
  css: string;
  classes?: string | string[] | null;
  hash?: string | null;
  updatedAt?: number;
  expiresAt?: number;
  source?: string | null;
}

export interface ProjectArtifact {
  css: string;
  hash?: string | null;
  updatedAt?: number;
  expiresAt?: number;
  source?: string | null;
}

export interface ReadPageArtifactInput {
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
  now: number;
}

export interface UpsertPageArtifactInput {
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
  css: string;
  hash: string;
  classes: string[];
  cached: boolean;
  updatedAt: number;
  expiresAt: number;
}

export interface DeletePageArtifactInput {
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
}

export interface DeleteProjectPageArtifactsInput {
  projectId: string;
}

export interface ReadProjectArtifactInput {
  projectId: string;
  bundle: NormalizedBundle;
  now: number;
}

export interface UpsertProjectArtifactInput {
  projectId: string;
  bundle: NormalizedBundle;
  css: string;
  hash: string | null;
  cached: boolean;
  updatedAt: number;
  expiresAt: number;
}

export interface DeleteProjectArtifactInput {
  projectId: string;
  bundle: NormalizedBundle;
}

export interface ReadPluginDataInput {
  pluginName: string;
  key: string;
}

export interface WritePluginDataInput {
  pluginName: string;
  key: string;
  value: unknown;
}

export interface DeletePluginDataInput {
  pluginName: string;
  key: string;
}

export interface ListPluginDataInput {
  pluginName: string;
  prefix: string;
}

export interface CacheStoreAdapter {
  readPageArtifact?(input: ReadPageArtifactInput): MaybePromise<PageArtifact | null>;
  upsertPageArtifact?(input: UpsertPageArtifactInput): MaybePromise<void>;
  deletePageArtifact?(input: DeletePageArtifactInput): MaybePromise<void>;
  deleteProjectPageArtifacts?(
    input: DeleteProjectPageArtifactsInput
  ): MaybePromise<void>;
  readProjectArtifact?(
    input: ReadProjectArtifactInput
  ): MaybePromise<ProjectArtifact | null>;
  upsertProjectArtifact?(input: UpsertProjectArtifactInput): MaybePromise<void>;
  deleteProjectArtifact?(input: DeleteProjectArtifactInput): MaybePromise<void>;
  readPluginData?(input: ReadPluginDataInput): MaybePromise<unknown | null>;
  writePluginData?(input: WritePluginDataInput): MaybePromise<void>;
  deletePluginData?(input: DeletePluginDataInput): MaybePromise<void>;
  listPluginData?(input: ListPluginDataInput): MaybePromise<string[]>;
}

export interface PageMeta {
  hash: string;
  updatedAt: number;
  expiresAt: number;
}

export interface CacheStats {
  totalPages: number;
  maxPages: number;
  projectCount: number;
}

export interface HydratePageArtifactInput {
  projectId: string;
  pageId: string;
  bundle?: Bundle;
  css: string;
  classes?: string | string[] | null;
  hash?: string | null;
  updatedAt?: number;
  expiresAt?: number;
  source?: string | null;
}

export interface HydrateProjectArtifactInput {
  projectId: string;
  bundle?: Bundle;
  css: string;
  hash?: string | null;
  updatedAt?: number;
  expiresAt?: number;
  source?: string | null;
}

export interface PluginContext {
  getProjectIds(): string[];
  getClassCounts(projectId: string): Readonly<Record<string, number>> | null;
  getPageIds(projectId: string): string[] | null;
  getPageClasses(projectId: string, pageId: string): string[] | null;
  getPageMeta(projectId: string, pageId: string): Readonly<PageMeta> | null;
  getCss(projectId: string, pageId: string, bundle?: Bundle): string | null;
  getProjectCss(projectId: string, bundle?: Bundle): string | null;
  getCacheStats(): Readonly<CacheStats>;
  getConfig(): Readonly<CoreConfig>;
  validateClasses(classes: string | string[]): Promise<string[]>;
  evictPage(projectId: string, pageId: string): void;
  evictProject(projectId: string): void;
  purgePage(projectId: string, pageId: string): Promise<boolean>;
  purgeProject(projectId: string): Promise<boolean>;
  compile(input: CompileInput): Promise<CompileResult>;
  hydratePageArtifact(input: HydratePageArtifactInput): boolean;
  hydrateProjectArtifact(input: HydrateProjectArtifactInput): boolean;
}

export type PluginRouteMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface PluginStorage {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

export interface PluginSetupContext extends PluginContext {
  addRoute(
    method: PluginRouteMethod,
    routePath: string,
    handler: RequestHandler
  ): void;
  storage: PluginStorage;
}

export interface OnRequestStartContext extends PluginContext {
  action: string;
  request: PluginRequestMeta;
  projectId?: string | null;
  pageId?: string | null;
  bundle?: Bundle;
  html?: string;
  classes?: string | string[];
  prefix?: string;
  limit?: number;
  source?: PluginSource;
}

export interface OnResponseSentContext extends OnRequestStartContext {
  status: number;
  durationMs: number;
}

export interface OnCompileStartContext extends PluginContext {
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
  html?: string;
  classes?: string | string[];
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface OnCompileResultContext extends PluginContext {
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
  css: string;
  classes: string[];
  hash: string;
  cached: boolean;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface OnCacheContext extends PluginContext {
  projectId: string;
  pageId: string;
  bundle: Bundle;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface OnProjectCssContext extends PluginContext {
  projectId: string;
  bundle: Bundle;
  css: string;
  hash: string | null;
  cached: boolean;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface OnSuggestContext extends PluginContext {
  projectId: string | null;
  prefix: string;
  suggestions: string[];
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface TransformClassesContext extends PluginContext {
  value: string[];
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface TransformCssContext extends PluginContext {
  value: string;
  projectId: string;
  pageId: string;
  bundle: NormalizedBundle;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface TransformSuggestionsContext extends PluginContext {
  value: string[];
  projectId: string | null;
  prefix: string;
  limit: number;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface ResolvePageCssContext extends PluginContext {
  projectId: string;
  pageId: string;
  bundle: Bundle;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface ResolveProjectCssContext extends PluginContext {
  projectId: string;
  bundle: Bundle;
  source: PluginSource;
  request: PluginRequestMeta | null;
}

export interface OnErrorContext extends PluginContext {
  error: Error;
  hook?: string;
  plugin?: string;
  timedOut?: boolean;
  stage?: string;
  source?: PluginSource;
  request?: PluginRequestMeta | null;
  context?: Record<string, unknown> | null;
  code?: string;
  op?: string;
}

export type PluginHookName =
  | 'guard'
  | 'onRequestStart'
  | 'onResponseSent'
  | 'onCompileStart'
  | 'onCompileResult'
  | 'onCacheHit'
  | 'onCacheMiss'
  | 'onProjectCss'
  | 'onSuggest'
  | 'onError'
  | 'transformClasses'
  | 'transformCss'
  | 'transformSuggestions'
  | 'resolvePageCss'
  | 'resolveProjectCss';

export interface RichWindPlugin {
  name?: string;
  defer?: boolean;
  deferHooks?: PluginHookName[];
  timeoutMs?: number;
  setupTimeoutMs?: number;
  setup?(context: PluginSetupContext): MaybePromise<void>;
  teardown?(): MaybePromise<void>;
  /** Runs for HTTP requests only. Return `{ blocked: true }` to stop the request. */
  guard?(context: PluginGuardContext): MaybePromise<PluginGuardResult | null | undefined>;
  onRequestStart?(context: OnRequestStartContext): MaybePromise<void>;
  onResponseSent?(context: OnResponseSentContext): MaybePromise<void>;
  onCompileStart?(context: OnCompileStartContext): MaybePromise<void>;
  onCompileResult?(context: OnCompileResultContext): MaybePromise<void>;
  onCacheHit?(context: OnCacheContext): MaybePromise<void>;
  onCacheMiss?(context: OnCacheContext): MaybePromise<void>;
  onProjectCss?(context: OnProjectCssContext): MaybePromise<void>;
  onSuggest?(context: OnSuggestContext): MaybePromise<void>;
  onError?(context: OnErrorContext): MaybePromise<void>;
  transformClasses?(
    context: TransformClassesContext
  ): MaybePromise<string[] | undefined>;
  transformCss?(context: TransformCssContext): MaybePromise<string | undefined>;
  transformSuggestions?(
    context: TransformSuggestionsContext
  ): MaybePromise<string[] | undefined>;
  resolvePageCss?(
    context: ResolvePageCssContext
  ): MaybePromise<PluginResolveResult | null | undefined>;
  resolveProjectCss?(
    context: ResolveProjectCssContext
  ): MaybePromise<PluginResolveResult | null | undefined>;
}

export interface CreateCoreOptions {
  plugins?: RichWindPlugin | RichWindPlugin[];
  pluginTimeoutMs?: number;
  setupTimeoutMs?: number;
  maxPluginCompileChainDepth?: number;
  config?: CoreConfigInput;
  cacheStore?: CacheStoreAdapter | null;
  cacheStoreTimeoutMs?: number;
}

export interface RichWindCore {
  app: Express;
  close(): Promise<void>;
}

export declare function createCore(
  options?: CreateCoreOptions
): Promise<RichWindCore>;
