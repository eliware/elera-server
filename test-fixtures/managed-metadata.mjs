import { createManagedMetadata } from "../src/metadata/managed.mjs";

export const createManagedMetadataForTest = (options = {}) =>
  createManagedMetadata({ identity: { name: "node.example.test" }, ...options });
