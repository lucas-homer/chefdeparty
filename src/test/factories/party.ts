import { faker } from "@faker-js/faker";
import type { NewParty } from "../../../drizzle/schema";

/**
 * Creates a party factory with Faker.
 */
export function createPartyFactory() {
  return {
    /**
     * Build a party object without persisting to database.
     */
    build(overrides: Partial<NewParty> = {}): NewParty {
      const partyDate = faker.date.future({ years: 1 });
      // Set to evening time (6-9 PM)
      partyDate.setHours(faker.number.int({ min: 18, max: 21 }), 0, 0, 0);

      return {
        id: faker.string.uuid(),
        hostId: faker.string.uuid(),
        name: `${faker.word.adjective()} ${faker.word.noun()} Party`,
        description: faker.lorem.paragraph(),
        dateTime: partyDate,
        location: faker.location.streetAddress({ useFullAddress: true }),
        shareToken: faker.string.alphanumeric(8),
        createdAt: faker.date.past(),
        ...overrides,
      };
    },

    /**
     * Build multiple parties.
     */
    buildMany(count: number, overrides: Partial<NewParty> = {}): NewParty[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },

    /**
     * Build an upcoming party (1 week from now).
     */
    buildUpcoming(overrides: Partial<NewParty> = {}): NewParty {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(19, 0, 0, 0);
      return this.build({ dateTime: date, ...overrides });
    },

    /**
     * Build a past party.
     */
    buildPast(overrides: Partial<NewParty> = {}): NewParty {
      const date = faker.date.past({ years: 1 });
      date.setHours(19, 0, 0, 0);
      return this.build({ dateTime: date, ...overrides });
    },
  };
}

export const partyFactory = createPartyFactory();
