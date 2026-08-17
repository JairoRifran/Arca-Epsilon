# Game Modes Foundation

`GameModeController` is the product lifecycle authority. Story retains its
existing `MissionManager` and save schema; Garage owns a small presentation
scene; offline Combat owns a `CombatSession` and never writes mission flags.

```text
LocalPlayerProfileRepository -> future RemotePlayerProfileRepository
Local ship entitlement       -> future backend / Steam entitlement authority
Offline CombatSession        -> future server-authoritative match snapshot
```

The composition root depends on `PlayerProfileRepository`, not its local
implementation. A future remote adapter can hydrate a trusted cached profile
during boot and keep the same synchronous read surface used by Garage.

`ShipDefinition` describes gameplay-capable catalog content. Ownership lives in
profile entitlements and acquisition history is deliberately not modeled as a
client purchase. Garage only asks the catalog and profile what is available.

Story, Garage and Combat all resolve `playerProfile.selectedShipId` through the
same catalog. Only `epsilon-scout` ships in this phase, so there are no fake
premium entries. Networking, accounts, Steamworks, prices and economy are
intentionally absent.
