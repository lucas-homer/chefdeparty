import { faker } from "@faker-js/faker";
import type { NewTimelineTask } from "../../../drizzle/schema";

const taskDescriptions = [
  "Prep vegetables",
  "Marinate protein",
  "Make sauce",
  "Preheat oven",
  "Set the table",
  "Chill drinks",
  "Mix dry ingredients",
  "Cook pasta",
  "Sauté aromatics",
  "Rest the meat",
  "Plate and garnish",
  "Final taste and adjust seasoning",
];

const phaseDescriptions = [
  "Time to start cooking!",
  "Main course prep begins",
  "Get the sides going",
  "Dessert prep time",
  "Final countdown to serving",
];

/**
 * Creates a timeline task factory with Faker.
 */
export function createTimelineTaskFactory() {
  return {
    /**
     * Build a timeline task object without persisting to database.
     */
    build(overrides: Partial<NewTimelineTask> = {}): NewTimelineTask {
      const hour = faker.number.int({ min: 9, max: 20 });
      const minute = faker.helpers.arrayElement([0, 15, 30, 45]);
      const scheduledTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

      const isPhaseStart = faker.datatype.boolean({ probability: 0.2 });

      return {
        id: faker.string.uuid(),
        partyId: faker.string.uuid(),
        recipeId: faker.datatype.boolean() ? faker.string.uuid() : null,
        description: faker.helpers.arrayElement(taskDescriptions),
        scheduledDate: faker.date.future({ years: 1 }),
        scheduledTime,
        durationMinutes: faker.number.int({ min: 5, max: 60 }),
        completed: faker.datatype.boolean({ probability: 0.1 }),
        sortOrder: faker.number.int({ min: 1, max: 20 }),
        isPhaseStart,
        phaseDescription: isPhaseStart
          ? faker.helpers.arrayElement(phaseDescriptions)
          : null,
        googleCalendarEventId: null,
        createdAt: faker.date.past(),
        ...overrides,
      };
    },

    /**
     * Build multiple timeline tasks.
     */
    buildMany(
      count: number,
      overrides: Partial<NewTimelineTask> = {}
    ): NewTimelineTask[] {
      return Array.from({ length: count }, (_, i) =>
        this.build({ sortOrder: i + 1, ...overrides })
      );
    },

    /**
     * Build a timeline for a party with tasks spread throughout the day.
     */
    buildPartyTimeline(
      partyId: string,
      partyDate: Date,
      recipeIds: string[] = []
    ): NewTimelineTask[] {
      const tasks: NewTimelineTask[] = [];
      const dayBefore = new Date(partyDate);
      dayBefore.setDate(dayBefore.getDate() - 1);

      // Day before tasks
      tasks.push(
        this.build({
          partyId,
          recipeId: recipeIds[0] || null,
          description: "Do any advance prep (marinating, brining, etc.)",
          scheduledDate: dayBefore,
          scheduledTime: "18:00",
          sortOrder: 1,
          isPhaseStart: true,
          phaseDescription: "Advance prep begins",
        })
      );

      // Day-of tasks
      const dayOfTasks = [
        {
          time: "14:00",
          desc: "Set up kitchen workspace",
          phase: true,
          phaseDesc: "Let's get cooking!",
        },
        { time: "14:30", desc: "Prep all vegetables", phase: false },
        { time: "15:00", desc: "Start any slow-cooking items", phase: false },
        {
          time: "16:00",
          desc: "Begin main course prep",
          phase: true,
          phaseDesc: "Main course time",
        },
        { time: "17:00", desc: "Prepare side dishes", phase: false },
        { time: "17:30", desc: "Set the table", phase: false },
        {
          time: "18:00",
          desc: "Final cooking and plating",
          phase: true,
          phaseDesc: "Almost showtime!",
        },
        { time: "18:30", desc: "Final touches and garnish", phase: false },
      ];

      dayOfTasks.forEach((task, i) => {
        tasks.push(
          this.build({
            partyId,
            recipeId: recipeIds[i % recipeIds.length] || null,
            description: task.desc,
            scheduledDate: partyDate,
            scheduledTime: task.time,
            sortOrder: i + 2,
            isPhaseStart: task.phase,
            phaseDescription: task.phase ? task.phaseDesc : null,
          })
        );
      });

      return tasks;
    },
  };
}

export const timelineTaskFactory = createTimelineTaskFactory();
