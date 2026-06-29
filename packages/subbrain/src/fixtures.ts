import type { SubbrainFixture } from "./index.js";

const motherEntities = {
  mother: { id: "entity_mother", type: "person", name: "어머니" },
  finger: { id: "entity_left_index_joint", type: "object", name: "왼쪽 검지 두번째 관절" },
  radish: { id: "entity_young_radish", type: "object", name: "열무" },
} as const;

export const motherCaseFixture: SubbrainFixture = {
  entries: [
    {
      id: "entry_steroid",
      text: "한 달 전 어머니가 왼쪽 검지 두번째 관절 부위에 스테로이드 주사를 맞았다.",
      recordedAt: "2026-05-15T20:00:00+09:00",
    },
    {
      id: "entry_radish",
      text: "어머니가 열무를 다듬다가 왼쪽 검지 두번째 관절 근처를 가시에 찔렸다.",
      recordedAt: "2026-06-12T20:00:00+09:00",
    },
    {
      id: "entry_symptom",
      text: "왼쪽 검지 두번째 관절 부위가 하얘지고 감각이 둔한 증상이 이어졌다.",
      recordedAt: "2026-06-26T20:00:00+09:00",
    },
    {
      id: "entry_dermatology_followup",
      text: "피부과에서 왼쪽 검지 두번째 관절 증상은 이전 스테로이드 주사 영향일 수 있다는 설명을 들었다.",
      recordedAt: "2026-06-28T20:00:00+09:00",
    },
  ],
  events: [
    {
      id: "event_steroid_injection",
      sourceEntryId: "entry_steroid",
      occurredAt: "2026-05-15",
      summary: "어머니가 왼쪽 검지 두번째 관절에 스테로이드 주사를 맞음",
      eventType: "prior_treatment",
      topics: ["손가락 증상", "이전 처치"],
      emotions: [],
      confidence: 0.95,
      entities: [motherEntities.mother, motherEntities.finger],
      attributes: [{ type: "body_area", value: "왼쪽 검지 두번째 관절" }],
    },
    {
      id: "event_radish_thorn",
      sourceEntryId: "entry_radish",
      occurredAt: "2026-06-12",
      summary: "어머니가 열무를 다듬다가 같은 손가락 부위를 가시에 찔림",
      eventType: "daily_incident",
      topics: ["손가락 증상", "열무 가시"],
      emotions: [],
      confidence: 0.9,
      entities: [motherEntities.mother, motherEntities.finger, motherEntities.radish],
      attributes: [{ type: "body_area", value: "왼쪽 검지 두번째 관절" }],
    },
    {
      id: "event_white_numb_symptom",
      sourceEntryId: "entry_symptom",
      occurredAt: "2026-06-26",
      summary: "왼쪽 검지 두번째 관절 부위가 하얘지고 감각이 둔한 증상이 지속됨",
      eventType: "observation",
      topics: ["손가락 증상"],
      emotions: ["걱정"],
      confidence: 0.94,
      entities: [motherEntities.mother, motherEntities.finger],
      attributes: [
        { type: "body_area", value: "왼쪽 검지 두번째 관절" },
        { type: "symptom", value: "하얘짐" },
        { type: "symptom", value: "감각 둔함" },
      ],
    },
    {
      id: "event_dermatology_followup",
      sourceEntryId: "entry_dermatology_followup",
      occurredAt: "2026-06-28",
      summary: "피부과에서 증상 원인 후보로 이전 스테로이드 주사 영향을 들음",
      eventType: "follow_up_observation",
      topics: ["손가락 증상", "이전 처치"],
      emotions: [],
      confidence: 0.9,
      entities: [motherEntities.mother, motherEntities.finger],
      attributes: [
        { type: "body_area", value: "왼쪽 검지 두번째 관절" },
        { type: "symptom", value: "감각 둔함" },
      ],
    },
  ],
  links: [
    {
      fromEventId: "event_steroid_injection",
      toEventId: "event_white_numb_symptom",
      type: "candidate_cause",
      reason: "같은 부위에서 증상보다 먼저 발생한 처치",
      confidence: 0.75,
    },
    {
      fromEventId: "event_dermatology_followup",
      toEventId: "event_white_numb_symptom",
      type: "follow_up",
      reason: "증상 이후 확인한 후속 진료",
      confidence: 0.9,
    },
  ],
  cases: [
    {
      id: "finger-cause",
      query: {
        text: "열무 가시에 찔린 뒤 왼쪽 검지가 하얘지고 감각이 둔한데 왜 그럴까?",
        referenceDate: "2026-06-27",
        topics: ["손가락 증상"],
        attributes: [{ type: "body_area", value: "왼쪽 검지 두번째 관절" }],
      },
      relevantEventIds: [
        "event_steroid_injection",
        "event_radish_thorn",
        "event_white_numb_symptom",
      ],
      forgottenEventIds: ["event_steroid_injection"],
    },
  ],
};

const workEntities = {
  manager: { id: "entity_manager", type: "person", name: "팀장" },
  project: { id: "entity_new_feature", type: "project", name: "신규 기능" },
  company: { id: "entity_company", type: "organization", name: "회사" },
} as const;

export const selfInsightFixture: SubbrainFixture = {
  entries: [
    {
      id: "entry_direction_change",
      text: "팀장과 1:1 뒤 신규 기능 방향이 또 바뀌어서 답답했고 이직 생각이 들었다.",
      recordedAt: "2026-04-12T20:00:00+09:00",
    },
    {
      id: "entry_low_growth",
      text: "요즘 회사에서 성장감이 낮고 같은 문제를 반복한다고 느꼈다.",
      recordedAt: "2026-05-03T20:00:00+09:00",
    },
    {
      id: "entry_autonomy_good",
      text: "스스로 결정한 신규 기능 실험은 몰입감이 높고 만족스러웠다.",
      recordedAt: "2026-05-28T20:00:00+09:00",
    },
    {
      id: "entry_job_change_again",
      text: "팀장과 방향 논의 후 다시 이직 고민이 커졌다.",
      recordedAt: "2026-06-20T20:00:00+09:00",
    },
    {
      id: "entry_process_churn",
      text: "계획 없이 우선순위가 바뀌는 일이 반복되어 주도권이 없다고 느꼈다.",
      recordedAt: "2026-06-24T20:00:00+09:00",
    },
  ],
  events: [
    {
      id: "event_direction_change",
      sourceEntryId: "entry_direction_change",
      occurredAt: "2026-04-12",
      summary: "팀장과 1:1 후 신규 기능 방향 변경에 답답함을 느낌",
      eventType: "work_reflection",
      topics: ["이직 고민", "업무 방향"],
      emotions: ["답답함"],
      confidence: 0.92,
      entities: [workEntities.manager, workEntities.project],
      attributes: [{ type: "work_mode", value: "방향 변경이 잦음" }],
    },
    {
      id: "event_low_growth",
      sourceEntryId: "entry_low_growth",
      occurredAt: "2026-05-03",
      summary: "회사에서 성장감이 낮고 같은 문제를 반복한다고 느낌",
      eventType: "self_insight",
      topics: ["이직 고민", "성장감"],
      emotions: ["피로감"],
      confidence: 0.9,
      entities: [workEntities.company],
      attributes: [{ type: "need", value: "성장감" }],
    },
    {
      id: "event_autonomy_good",
      sourceEntryId: "entry_autonomy_good",
      occurredAt: "2026-05-28",
      summary: "스스로 결정한 신규 기능 실험에서 몰입감과 만족감을 느낌",
      eventType: "positive_counterexample",
      topics: ["업무 만족", "자율성"],
      emotions: ["만족감"],
      confidence: 0.91,
      entities: [workEntities.project],
      attributes: [{ type: "need", value: "자율성" }],
    },
    {
      id: "event_job_change_again",
      sourceEntryId: "entry_job_change_again",
      occurredAt: "2026-06-20",
      summary: "팀장과 방향 논의 후 다시 이직 고민이 커짐",
      eventType: "work_reflection",
      topics: ["이직 고민", "업무 방향"],
      emotions: ["답답함"],
      confidence: 0.93,
      entities: [workEntities.manager],
      attributes: [{ type: "work_mode", value: "방향 변경이 잦음" }],
    },
    {
      id: "event_process_churn",
      sourceEntryId: "entry_process_churn",
      occurredAt: "2026-06-24",
      summary: "우선순위 변경이 반복되어 주도권이 없다고 느낌",
      eventType: "work_reflection",
      topics: ["이직 고민", "업무 방향", "자율성"],
      emotions: ["답답함"],
      confidence: 0.9,
      entities: [workEntities.company],
      attributes: [
        { type: "work_mode", value: "방향 변경이 잦음" },
        { type: "need", value: "자율성" },
      ],
    },
  ],
  links: [
    {
      fromEventId: "event_direction_change",
      toEventId: "event_job_change_again",
      type: "similar",
      reason: "팀장과 방향 논의 뒤 이직 고민이 반복됨",
      confidence: 0.82,
    },
    {
      fromEventId: "event_job_change_again",
      toEventId: "event_process_churn",
      type: "similar",
      reason: "방향 변경과 낮은 주도권이 이직 고민과 함께 반복됨",
      confidence: 0.78,
    },
  ],
  cases: [
    {
      id: "job-change-pattern",
      query: {
        text: "내가 왜 요즘 이직 생각을 자주 하지?",
        referenceDate: "2026-06-27",
        topics: ["이직 고민", "업무 방향"],
        emotions: ["답답함"],
        entities: ["팀장"],
      },
      relevantEventIds: [
        "event_direction_change",
        "event_low_growth",
        "event_job_change_again",
        "event_process_churn",
      ],
      forgottenEventIds: ["event_low_growth", "event_process_churn"],
    },
  ],
};

export const insufficientEvidenceFixture: SubbrainFixture = {
  entries: [
    {
      id: "entry_cafe_memory",
      text: "지난주 제주도 카페에서 책을 읽으며 조용한 시간을 보냈다.",
      recordedAt: "2026-06-18T20:00:00+09:00",
    },
  ],
  events: [
    {
      id: "event_cafe_memory",
      sourceEntryId: "entry_cafe_memory",
      occurredAt: "2026-06-18",
      summary: "제주도 카페에서 조용히 책을 읽음",
      eventType: "daily_memory",
      topics: ["여가"],
      emotions: ["만족감"],
      confidence: 0.85,
      entities: [{ id: "entity_jeju", type: "place", name: "제주도" }],
      attributes: [{ type: "activity", value: "독서" }],
    },
  ],
  links: [],
  cases: [
    {
      id: "unsupported-headache-cause",
      query: {
        text: "어제 머리가 아팠던 이유가 뭐였지?",
        referenceDate: "2026-06-27",
        topics: ["두통"],
        attributes: [{ type: "symptom", value: "두통" }],
      },
      relevantEventIds: [],
      forgottenEventIds: [],
    },
  ],
};
