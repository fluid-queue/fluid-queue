import { FunctionOrData } from "./helpers.js";
import { warn } from "../chalk-print.js";

export interface PersistedBinding {
  data?: unknown;
  version: string;
}

export interface TypedBinding<Data, Transient> {
  data: Data;
  transient: Transient;
  save(): void;
}

interface BindingOperations {
  fromPersisted(value: PersistedBinding): void;
  toPersisted(): PersistedBinding;
  clear(): void;
}

export interface BindingDescription<Data, Transient> {
  name: string;

  empty: FunctionOrData<Data, []>;
  initialize: FunctionOrData<Transient, [Data]>;

  serialize(data: Data, transient: Transient): PersistedBinding;
  deserialize(value: PersistedBinding): Data;
}

export interface TypeBindingBuilder<Data, Transient> {
  build(value?: PersistedBinding): { data: Data; transient: Transient };
  update(
    binding: TypedBinding<Data, Transient>,
    value?: PersistedBinding
  ): void;
}

export type SaveHandler = (name?: string) => void;

export interface BindingsApi {
  createQueueBinding<Data, Transient>(
    description: BindingDescription<Data, Transient>
  ): TypedBinding<Data, Transient>;
}

export class TypedBindings {
  private persistedBindings: Record<string, PersistedBinding> = {};
  private typeBindings: Record<string, BindingOperations> = {};
  private saveHandler: SaveHandler | null = null;
  private save(name: string) {
    if (this.saveHandler == null) {
      warn(
        `extension ${name} requested to save, but no save handler is registered`
      );
      return;
    }
    this.saveHandler(name);
  }
  setSaveHandler(saveHandler: SaveHandler) {
    this.saveHandler = saveHandler;
  }
  createTypeBindingBuilder<Data, Transient>(
    description: BindingDescription<Data, Transient>
  ): TypeBindingBuilder<Data, Transient> {
    const buildData = (value?: PersistedBinding): Data => {
      if (value != null) {
        return description.deserialize(value);
      }
      const empty = description.empty;
      if (typeof empty === "function") {
        return (empty as () => Data)();
      } else {
        return empty as Data;
      }
    };
    const buildTransient = (data: Data): Transient => {
      const initialize = description.initialize;
      if (typeof initialize === "function") {
        return (initialize as (data: Data) => Transient)(data);
      } else {
        return initialize as Transient;
      }
    };
    return {
      build(value?: PersistedBinding) {
        const data = buildData(value);
        const transient = buildTransient(data);
        return { data, transient };
      },
      update(binding: TypedBinding<Data, Transient>, value?: PersistedBinding) {
        const { data, transient } = this.build(value);
        binding.data = data;
        binding.transient = transient;
      },
    };
  }
  createTypeBinding<Data, Transient>(
    description: BindingDescription<Data, Transient>
  ): TypedBinding<Data, Transient> {
    if (description.name in this.typeBindings) {
      throw new Error(
        `Type binding of name ${description.name} already exists!`
      );
    }
    const builder = this.createTypeBindingBuilder(description);
    const { data, transient } = builder.build();
    const binding = {
      data,
      transient,
      save: this.save.bind(this, description.name),
      fromPersisted(value: PersistedBinding) {
        builder.update(this, value);
      },
      toPersisted(): PersistedBinding {
        return description.serialize(this.data, this.transient);
      },
      clear() {
        builder.update(this);
      },
    };
    this.typeBindings[description.name] = binding;
    return binding;
  }
  fromPersisted(newBindings: Record<string, PersistedBinding>) {
    this.persistedBindings = newBindings;
    // update bindings
    for (const [name, value] of Object.entries(this.typeBindings)) {
      if (name in this.persistedBindings) {
        value.fromPersisted(this.persistedBindings[name]);
      } else {
        value.clear();
      }
    }
  }
  toPersisted(): Record<string, PersistedBinding> {
    // update persisted data
    for (const [name, value] of Object.entries(this.typeBindings)) {
      this.persistedBindings[name] = value.toPersisted();
    }
    return this.persistedBindings;
  }

  get api(): BindingsApi {
    return {
      createQueueBinding: this.createTypeBinding.bind(this),
    };
  }
}
