import { faker } from "@faker-js/faker";
import type { NewGuest } from "../../../drizzle/schema";

const rsvpStatuses = ["pending", "yes", "no", "maybe"] as const;

const dietaryRestrictions = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut allergy",
  "shellfish allergy",
  "kosher",
  "halal",
];

/**
 * Creates a guest factory with Faker.
 */
export function createGuestFactory() {
  return {
    /**
     * Build a guest object without persisting to database.
     */
    build(overrides: Partial<NewGuest> = {}): NewGuest {
      return {
        id: faker.string.uuid(),
        partyId: faker.string.uuid(),
        userId: faker.datatype.boolean() ? faker.string.uuid() : null,
        email: faker.internet.email().toLowerCase(),
        name: faker.person.fullName(),
        rsvpStatus: faker.helpers.arrayElement(rsvpStatuses),
        headcount: faker.number.int({ min: 1, max: 4 }),
        dietaryRestrictions: faker.datatype.boolean()
          ? faker.helpers.arrayElements(
              dietaryRestrictions,
              faker.number.int({ min: 1, max: 2 })
            )
          : null,
        guestToken: faker.string.alphanumeric(12),
        createdAt: faker.date.past(),
        ...overrides,
      };
    },

    /**
     * Build multiple guests.
     */
    buildMany(count: number, overrides: Partial<NewGuest> = {}): NewGuest[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },

    /**
     * Build a guest who has confirmed attendance.
     */
    buildConfirmed(overrides: Partial<NewGuest> = {}): NewGuest {
      return this.build({ rsvpStatus: "yes", ...overrides });
    },

    /**
     * Build a guest who hasn't responded yet.
     */
    buildPending(overrides: Partial<NewGuest> = {}): NewGuest {
      return this.build({ rsvpStatus: "pending", ...overrides });
    },

    /**
     * Build a guest with dietary restrictions.
     */
    buildWithRestrictions(
      restrictions: string[],
      overrides: Partial<NewGuest> = {}
    ): NewGuest {
      return this.build({
        dietaryRestrictions: restrictions,
        rsvpStatus: "yes",
        ...overrides,
      });
    },

    /**
     * Build guests for a party with realistic mix of RSVP statuses.
     */
    buildPartyGuestList(
      partyId: string,
      count: number = 6
    ): NewGuest[] {
      const guests: NewGuest[] = [];

      // Ensure at least one of each status
      guests.push(this.buildConfirmed({ partyId }));
      guests.push(this.build({ partyId, rsvpStatus: "maybe" }));
      guests.push(this.buildPending({ partyId }));

      // Fill the rest randomly
      for (let i = guests.length; i < count; i++) {
        guests.push(this.build({ partyId }));
      }

      return guests;
    },
  };
}

export const guestFactory = createGuestFactory();
