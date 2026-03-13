import { PluginAPI, PluginPermission, PluginMenuItem } from './types';
export declare function setStatusGetter(getter: () => any): void;
export declare function setToastSender(sender: (msg: string, duration?: number) => void): void;
export declare function getMenuItems(): PluginMenuItem[];
export declare function emitPluginEvent(event: string, ...args: any[]): void;
export declare function createPluginAPI(pluginId: string, pluginDir: string, permissions: PluginPermission[], configDir: string): PluginAPI;
export declare function removePluginMenuItems(pluginId: string): void;
export declare function removePluginEventListeners(pluginId: string): void;
