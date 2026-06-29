declare module 'lil-gui' {
    export interface GUIParams {
        title?: string
        width?: number
        container?: HTMLElement
    }

    export interface GUIController {
        name(label: string): this;
        onChange(callback: (value: any) => void): this;
        listen(): this;
    }

    export default class GUI {
        constructor(options?: GUIParams);
        add(target: Record<string, unknown>, property: string, min?: number, max?: number, step?: number): GUIController;
        add(target: Record<string, unknown>, property: string, options: string[]): GUIController;
        addFolder(name: string): GUI;
        addColor(target: Record<string, unknown>, property: string): GUIController;
        addButton(title: string): GUIController;
        open(): this;
        close(): this;
        destroy(): void;
    }
}
