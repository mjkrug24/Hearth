/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // 1. hearth_settings
  if (!app.findCollectionByNameOrId("hearth_settings")) {
    const col = new Collection({
      name: "hearth_settings",
      type: "base",
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      schema: [
        {
          name: "user",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            cascadeDelete: false,
            maxSelect: 1,
            displayFields: ["email"]
          }
        },
        {
          name: "settings",
          type: "json",
          required: false,
          options: {
            maxSize: 2000000
          }
        }
      ]
    });
    app.save(col);
  }

  // 2. hearth_items
  if (!app.findCollectionByNameOrId("hearth_items")) {
    const col = new Collection({
      name: "hearth_items",
      type: "base",
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      indexes: [
        "CREATE INDEX `idx_hearth_items_kind` ON `hearth_items` (`kind`)"
      ],
      schema: [
        {
          name: "user",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            cascadeDelete: false,
            maxSelect: 1,
            displayFields: ["email"]
          }
        },
        {
          name: "client_id",
          type: "text",
          required: false
        },
        {
          name: "kind",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["tasks", "groceries", "pantry", "meals", "recipes"]
          }
        },
        {
          name: "name",
          type: "text",
          required: true
        },
        {
          name: "done",
          type: "bool",
          required: false
        },
        {
          name: "due",
          type: "text",
          required: false
        },
        {
          name: "quantity",
          type: "text",
          required: false
        },
        {
          name: "details",
          type: "json",
          required: false,
          options: {
            maxSize: 2000000
          }
        },
        {
          name: "assignedTo",
          type: "text",
          required: false
        }
      ]
    });
    app.save(col);
  }

  // 3. hearth_events
  if (!app.findCollectionByNameOrId("hearth_events")) {
    const col = new Collection({
      name: "hearth_events",
      type: "base",
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      indexes: [
        "CREATE INDEX `idx_hearth_events_date` ON `hearth_events` (`date`)"
      ],
      schema: [
        {
          name: "user",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            cascadeDelete: false,
            maxSelect: 1,
            displayFields: ["email"]
          }
        },
        {
          name: "client_id",
          type: "text",
          required: false
        },
        {
          name: "title",
          type: "text",
          required: true
        },
        {
          name: "date",
          type: "text",
          required: true
        },
        {
          name: "endDate",
          type: "text",
          required: false
        },
        {
          name: "time",
          type: "text",
          required: false
        },
        {
          name: "end",
          type: "text",
          required: false
        },
        {
          name: "allDay",
          type: "bool",
          required: false
        },
        {
          name: "location",
          type: "text",
          required: false
        },
        {
          name: "notes",
          type: "text",
          required: false
        },
        {
          name: "reminder",
          type: "text",
          required: false
        },
        {
          name: "repeat",
          type: "text",
          required: false
        },
        {
          name: "repeatCount",
          type: "number",
          required: false
        },
        {
          name: "timeZone",
          type: "text",
          required: false
        }
      ]
    });
    app.save(col);
  }
}, (app) => {
  // Revert / down migration
  const toDelete = ["hearth_events", "hearth_items", "hearth_settings"];
  for (const name of toDelete) {
    const col = app.findCollectionByNameOrId(name);
    if (col) app.delete(col);
  }
});

