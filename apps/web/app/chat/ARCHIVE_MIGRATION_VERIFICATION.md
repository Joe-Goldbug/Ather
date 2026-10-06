# Chat Migration Verification — Stage 1 Closed Loop

> Task 28, Step 3: Verify the new closed loop works without /chat dependency.

## Verified Closed Loop (no /chat required)

The Stage 1 closed loop operates entirely without `/chat`:

```
Assessment (14-16题) → Evidence (evidence_events) → Four-Factor Confidence
→ Profile/Map (UBV) → Next Round (confidence-driven)
```

### Evidence Flow (chat-independent):

1. **Assessment → Evidence**: `POST /assessment/complete` writes `evidence_kind='formal'` events
2. **Captures → Interpretations → Evidence**: `POST /captures` (analyze mode) → user confirms → `evidence_kind='reality'`
3. **Corrections → Candidate → Verification**: `POST /corrections` → `candidate=true` (×0.8) → subsequent same-direction evidence → verified (×1.0)
4. **Micro-Sandbox → Evidence**: Confidence-driven question selection → `evidence_kind='formal'` (×0.8, ≤3/day)
5. **Calibration → Evidence**: CalibrationModule handles follow-up questions (1-3 per round, anchored to test/capture)

### Services Migrated from chat-engine.ts (Task 18):

| Responsibility | New Home | Status |
|---|---|---|
| Evidence writing | `EvidenceService.writeEvidence()` | ✅ Active |
| UBV updates | `EvidenceService.recomputeDimension()` | ✅ Active |
| Correction detection | `CalibrationService` | ✅ Active |
| You Shifted detection | `ShiftDetectionService` (5 gates) | ✅ Active |
| Calibration follow-ups | `CalibrationService.buildCalibrationRound()` | ✅ Active |

### Entry Points (no /chat link exposed):

- Homepage (`/`): 做测试 / 记录 / 我的地图
- Report (`/report`): 做测试 / 记录 (no /chat)
- Assessment result: same-page feedback (no redirect to /chat)

### Archive Strategy:

- `EVA_LEGACY_CHAT_ENABLED=false` → `/chat/send` returns 410 Gone
- `/chat/history` remains accessible (read-only archive)
- `chat-engine.ts` preserved (not deleted in S1), deletion is future work

## Conclusion

The new closed loop (test → evidence → four-factor confidence → profile/map → next round)
functions independently of `/chat`. All critical chat responsibilities have been migrated
to dedicated services. Chat is safely archivable.
