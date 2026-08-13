// Test fixture: class with parameter-properties that Node's strip-types mode
// rejects ("TypeScript parameter property is not supported in strip-only mode")
export class TestParamPropPrivate {
    constructor(private foo: string) {}
    getFoo(): string {
        return this.foo
    }
}

export class TestParamPropPublicDefault {
    constructor(
        public x = 1,
        private y: number
    ) {}
    getY(): number {
        return this.y
    }
}

export class TestParamPropReadonly {
    constructor(readonly id: string) {}
    getId(): string {
        return this.id
    }
}

export class TestNoParamProp {
    val: number
    constructor(val: number) {
        this.val = val
    }
    getVal(): number {
        return this.val
    }
}

export class TestMultiParamProp {
    constructor(
        private a: string,
        private b: number,
        private flag: boolean
    ) {}
    getA(): string {
        return this.a
    }
    getB(): number {
        return this.b
    }
    getFlag(): boolean {
        return this.flag
    }
}

export class TestDefaultThenPrivate {
    opt: string
    private flag: boolean
    constructor(opt = 'DEFAULT', flag = true) {
        this.opt = opt
        this.flag = flag
    }
    getFlag(): boolean {
        return this.flag
    }
}
