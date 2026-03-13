import { PluginManifest, PluginRecord } from './types';
export declare function initPlugins(): Promise<void>;
export declare function getInstalledPlugins(): Array<{
    id: string;
    manifest: PluginManifest;
    record: PluginRecord;
    active: boolean;
}>;
export declare function enablePlugin(pluginId: string): Promise<boolean>;
export declare function disablePlugin(pluginId: string): Promise<void>;
export declare function uninstallPlugin(pluginId: string): Promise<void>;
export declare function installFromUrl(url: string, source?: 'lbhub' | 'github' | 'url'): Promise<{
    success: boolean;
    pluginId?: string;
    manifest?: PluginManifest;
    error?: string;
}>;
export declare function fetchFeaturedPlugins(): Promise<any[]>;
export declare function searchPlugins(query: string): Promise<any[]>;
export declare function isPluginActive(pluginId: string): boolean;
export declare function shutdownPlugins(): Promise<void>;
