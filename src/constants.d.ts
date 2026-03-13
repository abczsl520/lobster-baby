export declare const WINDOW_SIZE: {
    readonly NORMAL: {
        readonly width: 200;
        readonly height: 250;
    };
    readonly PANEL: {
        readonly width: 320;
        readonly height: 450;
    };
};
export declare const SNAP: {
    readonly DISTANCE: 15;
    readonly MAGNETIC_DISTANCE: 30;
    readonly MAGNETIC_STRENGTH: 0.3;
};
export declare const DRAG: {
    readonly THRESHOLD: 5;
    readonly DEBOUNCE: 500;
};
export declare const STATUS_CHECK: {
    readonly INTERVAL: 5000;
    readonly TIMEOUT: 8000;
    readonly RECENT_ACTIVITY_THRESHOLD: 30000;
};
export declare const ANIMATION: {
    readonly CLICK_DURATION: 500;
    readonly EMOJI_DURATION: 1800;
};
export declare const LEVEL_THRESHOLDS: readonly [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000];
