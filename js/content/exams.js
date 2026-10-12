// Original multiple-choice banks. level: CEFR number (A1=1 ... C2=6). answer: index of correct option.
// Used by the placement test and by Quick Exams. All items written for this project.
const mc = (cat, level, q, options, answer, explain) => ({ cat, level, q, options, answer, explain });

export const CATEGORIES = {
  tenses: 'Verb tenses',
  prepositions: 'Prepositions',
  articles: 'Articles & nouns',
  modals: 'Modals & conditionals',
  passive: 'Passive & reporting',
  construction: 'Construction vocabulary',
  pm: 'Project management vocabulary',
  collocations: 'Collocations',
  functional: 'Polite & functional language',
  email: 'Email & report phrases',
};

export const BANK = [
  // ---- tenses ----
  mc('tenses', 1, 'The site manager ___ in the office now.', ['is', 'are', 'am', 'be'], 0, 'Singular subject + present of "be": is.'),
  mc('tenses', 2, 'We ___ the foundation work last week.', ['finished', 'finish', 'have finish', 'finishing'], 0, '"Last week" is a finished time: past simple.'),
  mc('tenses', 2, 'I ___ on this project since January.', ['have worked', 'work', 'worked', 'am working'], 0, '"Since" a starting point up to now: present perfect.'),
  mc('tenses', 3, 'When I arrived at the site, the crew ___ the formwork.', ['had already removed', 'already remove', 'was already removing', 'has already removed'], 0, 'An earlier past action completed before another: past perfect.'),
  mc('tenses', 3, 'The consultant ___ us the revised drawings tomorrow.', ['is sending', 'sent', 'has sent', 'was sending'], 0, 'Present continuous is natural for a fixed arrangement.'),
  mc('tenses', 4, 'By the end of this month, we ___ the structure.', ['will have completed', 'will complete', 'have completed', 'are completing'], 0, 'Future perfect: finished before a future point.'),
  mc('tenses', 4, 'He ___ for the company for ten years when it closed.', ['had been working', 'has been working', 'was working', 'worked'], 0, 'Past perfect continuous for duration before a past event.'),
  mc('tenses', 2, 'She ___ English every evening.', ['studies', 'study', 'studying', 'is study'], 0, 'Third person singular present simple: studies.'),
  // ---- prepositions ----
  mc('prepositions', 2, 'The meeting is ___ Monday at 9 a.m.', ['on', 'in', 'at', 'to'], 0, 'On + day.'),
  mc('prepositions', 2, 'We are waiting ___ the approval.', ['for', 'to', 'of', 'at'], 0, 'Wait for.'),
  mc('prepositions', 3, 'The delay depends ___ the weather.', ['on', 'of', 'from', 'to'], 0, 'Depend on.'),
  mc('prepositions', 3, 'We have been working on this ___ three weeks.', ['for', 'since', 'from', 'during'], 0, '"For" + length of time.'),
  mc('prepositions', 3, 'I am responsible ___ the schedule.', ['for', 'of', 'about', 'on'], 0, 'Responsible for.'),
  mc('prepositions', 4, 'The contractor is liable ___ any defects.', ['for', 'of', 'to', 'with'], 0, 'Liable for.'),
  mc('prepositions', 4, 'We need to comply ___ the specifications.', ['with', 'to', 'of', 'by'], 0, 'Comply with.'),
  mc('prepositions', 3, 'Please send the report ___ me by Friday.', ['to', 'for', 'at', 'on'], 0, 'Send something to someone.'),
  // ---- articles / nouns ----
  mc('articles', 1, 'I have ___ meeting at ten.', ['a', 'an', 'the', 'two'], 0, 'Singular countable noun, first mention: a.'),
  mc('articles', 2, 'Can you give me some ___?', ['information', 'informations', 'an information', 'a informations'], 0, '"Information" is uncountable.'),
  mc('articles', 2, 'We need new ___ for the site.', ['equipment', 'equipments', 'an equipment', 'equipmenting'], 0, '"Equipment" is uncountable.'),
  mc('articles', 3, 'Could you close ___ door? It is cold.', ['the', 'a', 'an', 'no article'], 0, 'Both people know which door: the.'),
  mc('articles', 3, 'He gave me some useful ___.', ['advice', 'advices', 'an advice', 'advicing'], 0, '"Advice" is uncountable.'),
  mc('articles', 4, '___ progress we made last week was impressive.', ['The', 'A', 'An', 'Some of'], 0, 'Specific, defined noun: the.'),
  // ---- modals & conditionals ----
  mc('modals', 2, 'You ___ wear a helmet on site. It is mandatory.', ['must', 'might', 'would', 'could'], 0, 'Obligation: must.'),
  mc('modals', 3, 'If it rains tomorrow, we ___ the concrete pour.', ['will postpone', 'would postponed', 'postponed', 'are postponing it'], 0, 'First conditional: if + present, will + base.'),
  mc('modals', 3, 'You ___ to inform the engineer before you start.', ['ought', 'must to', 'can', 'would'], 0, '"Ought to" (+ infinitive) expresses advice or duty.'),
  mc('modals', 4, 'If we had more workers, we ___ the work faster.', ['would finish', 'will finish', 'finished', 'would have finish'], 0, 'Second conditional: if + past, would + base.'),
  mc('modals', 4, 'If the materials ___ on time last month, we would not be behind schedule now.', ['had arrived', 'arrived', 'would arrive', 'have arrived'], 0, 'Mixed conditional: past perfect in the if-clause.'),
  mc('modals', 5, '___ the client approved the variation earlier, the delay could have been avoided.', ['Had', 'If', 'Has', 'Having'], 0, 'Inverted third conditional: Had + subject + past participle.'),
  mc('modals', 5, 'Not only ___ the deadline, but they also exceeded the budget.', ['did they miss', 'they missed', 'missed they', 'they did miss'], 0, 'Negative adverbial at the start triggers inversion.'),
  // ---- passive & reporting ----
  mc('passive', 2, 'The drawings ___ yesterday.', ['were approved', 'approved', 'are approve', 'was approved'], 0, 'Plural subject, past passive: were approved.'),
  mc('passive', 3, 'The foundation ___ at the moment.', ['is being poured', 'is poured', 'pours', 'has pouring'], 0, 'Present continuous passive.'),
  mc('passive', 3, 'He said that he ___ the report the day before.', ['had sent', 'sends', 'will send', 'has sent'], 0, 'Reported speech backshift: past perfect.'),
  mc('passive', 4, 'The inspector asked me ___ the permit.', ['whether I had', 'did I have', 'if had I', 'that I have'], 0, 'Reported yes/no question: whether/if + subject + verb.'),
  mc('passive', 4, 'The site ___ to have been closed due to safety concerns.', ['is reported', 'reports', 'is reporting', 'has report'], 0, '"is reported to have been": passive reporting structure.'),
  // ---- construction vocabulary ----
  mc('construction', 2, 'Concrete is poured into ___ to make columns and beams.', ['formwork', 'scaffolding', 'a crane', 'a permit'], 0, 'Formwork is the temporary mould.'),
  mc('construction', 3, 'A document listing quantities of materials and work items is a ___.', ['bill of quantities', 'change order', 'site diary', 'method statement'], 0, 'BOQ / bill of quantities.'),
  mc('construction', 3, 'Temporary structures that support workers at height are called ___.', ['scaffolding', 'rebar', 'cladding', 'screed'], 0, 'Scaffolding.'),
  mc('construction', 4, 'A written instruction that changes the scope of work is a ___.', ['variation order', 'handover', 'snag list', 'tender'], 0, 'Variation order / change order.'),
  mc('construction', 4, 'A list of minor defects to be fixed before final acceptance is a ___ list.', ['snag', 'punch-out', 'float', 'critical'], 0, 'Snag list (also called punch list).'),
  mc('construction', 4, 'The period after completion when the contractor must repair defects is the ___.', ['defects liability period', 'critical path', 'mobilisation phase', 'tender stage'], 0, 'Defects liability period.'),
  // ---- project management vocabulary ----
  mc('pm', 2, 'A date by which work must be finished is a ___.', ['deadline', 'budget', 'risk', 'scope'], 0, 'Deadline.'),
  mc('pm', 3, 'A significant point in the schedule, such as "foundations complete", is a ___.', ['milestone', 'baseline', 'resource', 'float'], 0, 'Milestone.'),
  mc('pm', 3, 'The amount of time an activity can slip without delaying the project is ___.', ['float', 'slack-off', 'lag-time cost', 'lead budget'], 0, 'Float (slack).'),
  mc('pm', 4, 'The longest sequence of dependent activities that determines the project end date is the ___ path.', ['critical', 'main', 'central', 'primary'], 0, 'Critical path.'),
  mc('pm', 4, 'To reduce the impact of a risk is to ___ it.', ['mitigate', 'mediate', 'migrate', 'militate'], 0, 'Mitigate.'),
  mc('pm', 5, 'To make a process happen faster is to ___ it.', ['expedite', 'exempt', 'extort', 'expunge'], 0, 'Expedite.'),
  mc('pm', 5, 'A contractor that "defaults" has ___.', ['failed to meet its obligations', 'finished early', 'changed the design', 'won the tender'], 0, 'Default = failure to perform contractual duties.'),
  mc('pm', 4, 'Cost Performance Index (CPI) below 1.0 means the project is ___.', ['over budget', 'under budget', 'ahead of schedule', 'on budget exactly'], 0, 'CPI = EV/AC; below 1 = cost overrun.'),
  mc('pm', 4, 'Schedule Performance Index (SPI) below 1.0 means the project is ___.', ['behind schedule', 'ahead of schedule', 'over budget', 'complete'], 0, 'SPI = EV/PV; below 1 = behind.'),
  // ---- collocations ----
  mc('collocations', 3, 'We need to ___ a decision before Friday.', ['make', 'do', 'take place', 'give'], 0, 'Make a decision.'),
  mc('collocations', 3, 'The team ___ progress despite the heat.', ['made', 'did', 'took', 'gave'], 0, 'Make progress.'),
  mc('collocations', 4, 'Please ___ attention to the safety notice.', ['pay', 'give out', 'make', 'do'], 0, 'Pay attention.'),
  mc('collocations', 4, 'The contractor ___ a claim for an extension of time.', ['submitted', 'did', 'put out', 'carried'], 0, 'Submit/lodge a claim.'),
  mc('collocations', 4, 'We are working to ___ the deadline.', ['meet', 'catch', 'reach up', 'follow'], 0, 'Meet a deadline.'),
  mc('collocations', 5, 'The delay had a ___ impact on the cash flow.', ['significant', 'strong-high', 'much', 'huge-big'], 0, 'Significant impact.'),
  // ---- polite & functional language ----
  mc('functional', 3, 'You want to politely disagree. Which is best?', ['I see your point, but I\'m not sure that will work.', 'You are wrong.', 'No. That is bad.', 'I don\'t agree you.'], 0, 'Acknowledge, then soften the disagreement.'),
  mc('functional', 3, 'You did not hear the last sentence. Which is best?', ['Sorry, could you repeat that, please?', 'What?', 'Say again!', 'You speak not clear.'], 0, 'Polite request to repeat.'),
  mc('functional', 4, 'You are not certain. Which is the most professional?', ['I\'m not entirely sure, but I believe it is next Tuesday.', 'Maybe yes maybe no.', 'I don\'t know nothing.', 'It is surely perhaps Tuesday.'], 0, 'Hedging with "not entirely sure" and "I believe".'),
  mc('functional', 4, 'You need clarification. Which is best?', ['Could you clarify what you mean by "substantial completion"?', 'Explain me substantial completion.', 'What is it substantial completion?', 'I no understand it.'], 0, 'Clarify + specific term.'),
  mc('functional', 5, 'You want to push back diplomatically on a deadline. Which is best?', ['I appreciate the urgency; however, given the current resources, I\'d like to propose a revised date.', 'That date is impossible.', 'We will not do it.', 'You must change the date.'], 0, 'Acknowledge, state constraint, propose alternative.'),
  // ---- email & report phrases ----
  mc('email', 3, 'Which opening is best for a formal email to a consultant you do not know?', ['Dear Mr. Johnson,', 'Hey Johnson,', 'Hi dude,', 'Hello my friend,'], 0, 'Formal salutation.'),
  mc('email', 3, 'Choose the correct sentence.', ['Please find the attached schedule.', 'Please find attached the schedule for you.', 'Please to find attach schedule.', 'Find you the attached schedule.'], 0, 'Standard phrase.'),
  mc('email', 4, 'Which sentence best announces a delay professionally?', ['We regret to inform you that the handover will be delayed by two weeks due to late material delivery.', 'The handover is late because suppliers are bad.', 'Handover delay two weeks.', 'We delay the handover and it is not our problem.'], 0, 'Neutral, factual, states cause and duration.'),
  mc('email', 4, 'Which closing is most natural when you expect a reply?', ['I look forward to hearing from you.', 'I am waiting your reply fast.', 'Reply me soon.', 'Answer me please quickly.'], 0, 'Fixed polite phrase.'),
  mc('email', 5, 'Which sentence is the most precise for meeting minutes?', ['It was agreed that the contractor would submit the revised programme by 15 March.', 'They said they will maybe submit the programme.', 'The programme is something about March.', 'Contractor programme soon.'], 0, 'Passive "it was agreed that", clear action and date.'),
];

// Placement-specific items: reading passages, listening items, vocabulary in context.
export const PLACEMENT_READING = [
  {
    level: 2,
    title: 'A short note from site',
    text: 'Hi Sara. The delivery of steel bars came late today. The truck had a problem on the road. We started the work at 10 a.m. instead of 8 a.m. Tomorrow the truck will arrive early. Please tell the manager.',
    questions: [
      mc('reading', 2, 'Why did the work start late?', ['The steel delivery was late.', 'The workers were ill.', 'It rained.', 'The manager was absent.'], 0, ''),
      mc('reading', 2, 'What will happen tomorrow?', ['The truck will arrive early.', 'The work will stop.', 'Sara will visit the site.', 'The manager will leave.'], 0, ''),
    ],
  },
  {
    level: 3.5,
    title: 'Weekly progress update',
    text: 'Although the structural work is 85% complete, the project is currently two weeks behind the baseline programme. The main reason is the late approval of the revised shop drawings, which prevented the steel fabricator from starting on time. The project team has proposed working additional shifts on weekends to recover the lost time, but this will increase labour costs by about 6%. The client has not yet decided whether to accept the extra cost.',
    questions: [
      mc('reading', 3, 'What caused the delay?', ['Late approval of shop drawings', 'A shortage of workers', 'Bad weather', 'A design error by the contractor'], 0, ''),
      mc('reading', 4, 'What is the proposed way to recover time?', ['Working extra shifts at weekends', 'Reducing the scope', 'Replacing the fabricator', 'Starting a new baseline'], 0, ''),
      mc('reading', 4, 'What is still undecided?', ['Whether the client accepts the extra cost', 'Whether the structure is complete', 'Which fabricator to use', 'The new project end date'], 0, ''),
    ],
  },
  {
    level: 5,
    title: 'Extension of time',
    text: 'Notwithstanding the contractor\'s assertion that the inclement weather constituted an excusable event, the engineer maintains that the delay was foreseeable and could have been mitigated through reasonable resequencing of the works. Consequently, the request for an extension of time has been rejected in part, with only nine of the claimed twenty-one days being granted pending submission of supporting records.',
    questions: [
      mc('reading', 5, 'What was the outcome of the contractor\'s request?', ['It was partly granted.', 'It was fully granted.', 'It was fully refused.', 'It was withdrawn.'], 0, ''),
      mc('reading', 5, 'Why does the engineer think the delay could have been reduced?', ['The contractor could have rearranged the order of work.', 'The weather was not bad.', 'The records were missing.', 'The design changed.'], 0, ''),
      mc('reading', 5, 'In this context "foreseeable" means:', ['could have been expected', 'impossible to predict', 'caused by the client', 'already compensated'], 0, ''),
    ],
  },
];

export const PLACEMENT_LISTENING = [
  { level: 1.5, accent: 'en-US', text: 'The meeting starts at nine. Please bring your laptop and the schedule.', q: mc('listening', 1.5, 'What should you bring?', ['A laptop and the schedule', 'A helmet', 'The contract', 'Lunch'], 0, '') },
  { level: 3, accent: 'en-GB', text: 'I am afraid the concrete delivery has been moved to Thursday afternoon because of a problem at the plant, so we will need to reschedule the pour.', q: mc('listening', 3, 'Why must the pour be rescheduled?', ['The delivery was moved to Thursday afternoon.', 'There is no concrete plant.', 'The pour was cancelled by the client.', 'It will rain on Thursday.'], 0, '') },
  { level: 4, accent: 'en-AU', text: 'If the consultant approves the revised sequence by Wednesday, we can mobilise a second crew and recover about four days, although that depends on getting the permits in time.', q: mc('listening', 4, 'What does recovering four days depend on?', ['Approval and getting permits in time', 'Hiring more consultants', 'Reducing the budget', 'Finishing on Wednesday'], 0, '') },
  { level: 5, accent: 'en-IN', text: 'Having reviewed the claim, we are not in a position to accept that the late issue of drawings alone caused the entire delay; however, we acknowledge that a portion of it is attributable to us.', q: mc('listening', 5, 'What is the speaker\'s position?', ['Partly accepting responsibility', 'Fully rejecting the claim', 'Fully accepting the claim', 'Asking for new drawings'], 0, '') },
];

export const PLACEMENT_VOCAB = [
  mc('vocab', 1, '"Deadline" means:', ['the date work must be finished', 'a dead worker', 'a type of line', 'a safety rule'], 0, ''),
  mc('vocab', 2, '"Postpone" means:', ['move to a later time', 'cancel forever', 'start early', 'repeat'], 0, ''),
  mc('vocab', 3, 'A "draft" is:', ['an early version, not final', 'a cold wind', 'a final copy', 'a signed contract'], 0, ''),
  mc('vocab', 3, '"Approximately" means:', ['about, not exactly', 'exactly', 'never', 'only'], 0, ''),
  mc('vocab', 4, '"Mitigate" a risk means:', ['reduce its impact', 'ignore it', 'increase it', 'transfer it to a bank'], 0, ''),
  mc('vocab', 4, '"Ambiguous" wording is:', ['open to more than one meaning', 'very clear', 'very long', 'legally binding'], 0, ''),
  mc('vocab', 5, '"Expedite" means:', ['speed up', 'delay', 'inspect', 'exempt'], 0, ''),
  mc('vocab', 5, '"Contentious" describes something:', ['likely to cause disagreement', 'very cheap', 'completed', 'urgent'], 0, ''),
  mc('vocab', 6, 'A "tenable" position is one that:', ['can be defended', 'must be abandoned', 'is temporary', 'is very strong-sounding but false'], 0, ''),
  mc('vocab', 6, 'To "obviate" a need is to:', ['remove the need for it', 'increase it', 'ignore it', 'explain it'], 0, ''),
];

export const PLACEMENT_PROMPTS = {
  writing: 'Write 4 to 6 sentences to a colleague. Explain that a concrete pour has been postponed, say why, and suggest a new date.',
  speaking: 'Speak for about one minute: describe your current project, your role, and one problem you are dealing with this week.',
};
