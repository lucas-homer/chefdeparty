import { faker } from "@faker-js/faker";
import type { User, NewUser } from "../../../drizzle/schema";

/**
 * Creates a user factory with Faker.
 */
export function createUserFactory() {
  return {
    /**
     * Build a user object without persisting to database.
     */
    build(overrides: Partial<NewUser> = {}): NewUser {
      return {
        id: faker.string.uuid(),
        email: faker.internet.email().toLowerCase(),
        name: faker.person.fullName(),
        image: faker.image.avatar(),
        emailVerified: faker.datatype.boolean() ? faker.date.past() : null,
        createdAt: faker.date.past(),
        ...overrides,
      };
    },

    /**
     * Build multiple users.
     */
    buildMany(count: number, overrides: Partial<NewUser> = {}): NewUser[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },
  };
}

// Preset users for common test scenarios
export const presetUsers = {
  host: () =>
    createUserFactory().build({
      id: "preset-host-id",
      email: "host@test.com",
      name: "Test Host",
    }),
  guest: () =>
    createUserFactory().build({
      id: "preset-guest-id",
      email: "guest@test.com",
      name: "Test Guest",
    }),
  admin: () =>
    createUserFactory().build({
      id: "preset-admin-id",
      email: "admin@test.com",
      name: "Test Admin",
    }),
};

export const userFactory = createUserFactory();
