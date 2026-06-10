declare module 'three/examples/jsm/lines/Line2.js' {
    import { Line } from 'three';
    export class Line2 extends Line {
        computeLineDistances(): this;
    }
}

declare module 'three/examples/jsm/lines/LineGeometry.js' {
    import { BufferGeometry } from 'three';
    export class LineGeometry extends BufferGeometry {
        setPositions(array: number[]): this;
        setColors(array: number[]): this;
    }
}

declare module 'three/examples/jsm/lines/LineMaterial.js' {
    import { ShaderMaterial } from 'three';
    export class LineMaterial extends ShaderMaterial {
        linewidth: number;
        resolution: { x: number; y: number };
    }
}
