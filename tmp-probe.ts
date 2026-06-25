
import { Object3D } from 'three'

type DisposeShape = {
    geometry?: { dispose?(): void }
    material?: { dispose?(): void } | { dispose?(): void }[]
}

declare const x: Object3D
declare const fn: (s: DisposeShape) => void

// Unannotated param:
fn(x)
