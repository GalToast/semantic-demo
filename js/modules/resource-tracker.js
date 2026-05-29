export class ResourceTracker {
    constructor() {
        this.resources = new Set();
    }

    track(resource) {
        if (!resource) return resource;

        if (Array.isArray(resource)) {
            resource.forEach(r => this.track(r));
            return resource;
        }

        if (resource.dispose) {
            this.resources.add(resource);
        }

        // If it's an Object3D, also track its geometry and materials
        if (resource.geometry) {
            this.track(resource.geometry);
        }
        if (resource.material) {
            this.track(resource.material);
            // Track common textures
            const mat = resource.material;
            if (mat.map) this.track(mat.map);
            if (mat.alphaMap) this.track(mat.alphaMap);
            if (mat.envMap) this.track(mat.envMap);
            if (mat.normalMap) this.track(mat.normalMap);
        }
        if (resource.children && Array.isArray(resource.children)) {
            this.track(resource.children);
        }

        return resource;
    }

    untrack(resource) {
        this.resources.delete(resource);
    }

    dispose() {
        for (const resource of this.resources) {
            if (resource.dispose) {
                resource.dispose();
            }
        }
        this.resources.clear();
    }
}
