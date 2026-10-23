const {
  z, schemaVersion, versionString, prefixedId, entryId, confidence, nonEmptyText,
  TextRefSchema, field, PartialDateSchema, DurationRangeSchema, DateRangeSchema,
  SectionTypeSchema, DegreeLevelSchema,
} = require('./primitives');

/**
 * ResumeProfile — "what the document says". Job-independent structure extracted
 * from a NormalizedDocument. Every extracted fact points back at document lines.
 */

const skillId = z.string().regex(/^[a-z0-9][a-z0-9.+#/-]{0,63}$/, 'Expected a taxonomy skill id');

const BulletSchema = z.strictObject({
  id: prefixedId('blt'),
  ref: TextRefSchema,
  text: nonEmptyText,
  actionVerb: z.string().min(1).nullable(),
  metrics: z.array(
    z.strictObject({
      raw: nonEmptyText,
      kind: z.enum(['percent', 'currency', 'count', 'duration', 'multiplier', 'other']),
    })
  ),
  skillIds: z.array(skillId),
});

const ExperienceEntrySchema = z.strictObject({
  id: prefixedId('exp'),
  title: field(nonEmptyText).nullable(),
  organization: field(nonEmptyText).nullable(),
  location: field(nonEmptyText).nullable(),
  employmentType: z.enum(['full_time', 'internship', 'part_time', 'contract', 'freelance', 'unknown']),
  dates: DateRangeSchema.nullable(),
  headerRefs: z.array(TextRefSchema),
  bullets: z.array(BulletSchema),
  descriptionRefs: z.array(TextRefSchema),
  skillIds: z.array(skillId),
});

const ProjectEntrySchema = z.strictObject({
  id: prefixedId('proj'),
  name: field(nonEmptyText).nullable(),
  context: z.enum(['personal', 'academic', 'professional', 'open_source', 'hackathon', 'unknown']),
  dates: DateRangeSchema.nullable(),
  links: z.array(z.string().min(1)),
  techStack: z.array(skillId),
  headerRefs: z.array(TextRefSchema),
  bullets: z.array(BulletSchema),
  skillIds: z.array(skillId),
});

const EducationEntrySchema = z.strictObject({
  id: prefixedId('edu'),
  institution: field(nonEmptyText).nullable(),
  degree: z.strictObject({ raw: nonEmptyText, level: DegreeLevelSchema, ref: TextRefSchema }).nullable(),
  fieldOfStudy: z.strictObject({ raw: nonEmptyText, fieldId: z.string().min(1).nullable() }).nullable(),
  dates: DateRangeSchema.nullable(),
  status: z.enum(['completed', 'in_progress', 'unknown']),
  gpa: z.strictObject({ value: z.number().min(0), scale: z.number().positive() }).nullable(),
  honors: z.array(nonEmptyText),
  refs: z.array(TextRefSchema),
});

const CertificationEntrySchema = z.strictObject({
  id: prefixedId('cert'),
  name: field(nonEmptyText),
  certificationId: z.string().min(1).nullable(),
  issuer: z.string().min(1).nullable(),
  issued: PartialDateSchema.nullable(),
  expires: PartialDateSchema.nullable(),
  status: z.enum(['active', 'in_progress', 'expired', 'unknown']),
});

const SkillMentionSchema = z.strictObject({
  skillId,
  surface: nonEmptyText,
  ref: TextRefSchema,
  section: SectionTypeSchema,
  entryId: entryId.nullable(),
  bulletId: prefixedId('blt').nullable(),
  recognition: z.enum(['canonical', 'normalized', 'alias']),
  ambiguous: z.boolean(),
  confidence,
});

const ResumeProfileSchema = z
  .strictObject({
    schemaVersion,
    parserVersion: versionString,
    contact: z.strictObject({
      name: field(nonEmptyText).nullable(),
      emails: z.array(field(z.email())),
      phones: z.array(field(nonEmptyText)),
      location: field(nonEmptyText).nullable(),
      links: z.array(
        z.strictObject({
          kind: z.enum(['linkedin', 'github', 'portfolio', 'other']),
          url: z.string().min(1),
          ref: TextRefSchema.nullable(),
        })
      ),
    }),
    sections: z.array(
      z.strictObject({
        id: prefixedId('sec'),
        type: SectionTypeSchema,
        heading: z.string().min(1).nullable(),
        startLine: z.number().int().min(0),
        endLine: z.number().int().min(0),
        confidence,
      })
    ),
    summary: z.strictObject({ text: nonEmptyText, refs: z.array(TextRefSchema) }).nullable(),
    experience: z.array(ExperienceEntrySchema),
    projects: z.array(ProjectEntrySchema),
    education: z.array(EducationEntrySchema),
    certifications: z.array(CertificationEntrySchema),
    skillMentions: z.array(SkillMentionSchema),
    skillsSection: z.array(z.strictObject({ raw: nonEmptyText, skillId: skillId.nullable(), ref: TextRefSchema })),
    achievements: z.array(z.strictObject({ text: nonEmptyText, ref: TextRefSchema })),
    languages: z.array(z.strictObject({ name: nonEmptyText, proficiency: z.string().min(1).nullable(), ref: TextRefSchema })),
    totals: z.strictObject({
      professionalMonths: DurationRangeSchema.nullable(),
      internshipMonths: DurationRangeSchema.nullable(),
    }),
    diagnostics: z.strictObject({
      unassignedLineCount: z.number().int().min(0),
      warnings: z.array(
        z.strictObject({ code: z.string().regex(/^[A-Z0-9_]+$/), message: nonEmptyText, ref: TextRefSchema.nullable() })
      ),
    }),
  })
  .check((ctx) => {
    const profile = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: profile, message, path });

    profile.sections.forEach((s, i) => {
      if (s.endLine < s.startLine) push('endLine must be >= startLine', ['sections', i, 'endLine']);
    });

    const entryIds = new Set();
    const bulletIds = new Set();
    for (const [key, entries] of Object.entries({
      experience: profile.experience, projects: profile.projects,
      education: profile.education, certifications: profile.certifications,
    })) {
      entries.forEach((entry, i) => {
        if (entryIds.has(entry.id)) push(`duplicate entry id ${entry.id}`, [key, i, 'id']);
        entryIds.add(entry.id);
        (entry.bullets || []).forEach((b) => bulletIds.add(b.id));
      });
    }

    profile.skillMentions.forEach((m, i) => {
      if (m.entryId !== null && !entryIds.has(m.entryId)) push(`skill mention references unknown entry ${m.entryId}`, ['skillMentions', i, 'entryId']);
      if (m.bulletId !== null && !bulletIds.has(m.bulletId)) push(`skill mention references unknown bullet ${m.bulletId}`, ['skillMentions', i, 'bulletId']);
    });
  });

module.exports = {
  skillId,
  BulletSchema,
  ExperienceEntrySchema,
  ProjectEntrySchema,
  EducationEntrySchema,
  CertificationEntrySchema,
  SkillMentionSchema,
  ResumeProfileSchema,
};
