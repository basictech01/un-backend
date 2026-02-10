import { err, ok, Result } from 'neverthrow';
import { ERRORS, RequestError } from '../utils/error.ts';

// =====================================================
// Editorial Sections & Subsections
// App-level constants — validated at resolver layer,
// stored as plain strings in the DB.
// =====================================================

export const SECTIONS = {
    VOICES_AND_VISIONARIES: {
        key: 'VOICES_AND_VISIONARIES',
        label: 'Voices & Visionaries',
        tagline: 'People who shape today & imagine future',
        description: 'People who shape opinion, earn accolades, and represent the diaspora',
    },
    LEARNING_AND_LADDERS: {
        key: 'LEARNING_AND_LADDERS',
        label: 'Learning & Ladders',
        tagline: 'Knowledge as the true path uphill',
        description: 'Education, aptitude, and innovation stories',
    },
    GROWTH_AND_GRIT: {
        key: 'GROWTH_AND_GRIT',
        label: 'Growth & Grit',
        tagline: 'Enterprise forged in thin air and thick resolve',
        description: 'Entrepreneurial endeavours and infrastructure technology',
    },
    STATE_AND_STEWARDSHIP: {
        key: 'STATE_AND_STEWARDSHIP',
        label: 'State & Stewardship',
        tagline: 'Power held as responsibility, not privilege',
        description: 'Governance and political landscape',
    },
    NATURE_AND_NURTURE: {
        key: 'NATURE_AND_NURTURE',
        label: 'Nature & Nurture',
        tagline: 'Where survival and serenity coexist',
        description: 'Environment, nature, and wellness',
    },
    SPIRIT_AND_STORY: {
        key: 'SPIRIT_AND_STORY',
        label: 'Spirit & Story',
        tagline: 'The unseen threads that bind Uttarakhand',
        description: 'Cultural odyssey and heritage moorings',
    },
} as const;

export const SUBSECTIONS: Record<string, {
    label: string;
    tagline: string;
    description: string;
    parentSection: string;
}> = {
    // ── VOICES_AND_VISIONARIES ──────────────────────────
    CHARISMA: {
        label: 'Charisma',
        tagline: 'People Who Move the Mountains',
        description: 'Will that bends terrain.',
        parentSection: 'VOICES_AND_VISIONARIES',
    },
    ACCOLADES: {
        label: 'Accolades',
        tagline: 'Celebrating Excellence',
        description: 'Merit that echoes beyond valleys.',
        parentSection: 'VOICES_AND_VISIONARIES',
    },
    DIASPORA: {
        label: 'Diaspora',
        tagline: 'Global Souls, Local Roots',
        description: 'Hearts abroad, Uttarakhand within.',
        parentSection: 'VOICES_AND_VISIONARIES',
    },

    // ── LEARNING_AND_LADDERS ────────────────────────────
    EDUCATION: {
        label: 'Education',
        tagline: 'Campuses of Change',
        description: 'Classrooms shaping the next ascent.',
        parentSection: 'LEARNING_AND_LADDERS',
    },
    APTITUDE: {
        label: 'Aptitude',
        tagline: 'Skills. Smarts. Shaping Futures',
        description: 'Hands trained, minds awakened.',
        parentSection: 'LEARNING_AND_LADDERS',
    },
    INNOVATION: {
        label: 'Innovation',
        tagline: 'Ideas that Elevate',
        description: 'Thoughts that climb higher.',
        parentSection: 'LEARNING_AND_LADDERS',
    },

    // ── GROWTH_AND_GRIT ─────────────────────────────────
    ENDEAVOURS: {
        label: 'Endeavours',
        tagline: 'Enterprise in the Hills',
        description: 'Livelihoods born of land and courage.',
        parentSection: 'GROWTH_AND_GRIT',
    },
    INFRATECH: {
        label: 'InfraTech',
        tagline: 'Building the Backbone of Progress',
        description: 'Foundations that respect the mountains.',
        parentSection: 'GROWTH_AND_GRIT',
    },

    // ── STATE_AND_STEWARDSHIP ───────────────────────────
    GOVERNANCE: {
        label: 'Governance',
        tagline: 'Where Policy Meets People',
        description: 'Decisions felt on the ground.',
        parentSection: 'STATE_AND_STEWARDSHIP',
    },
    RAAG_DARBARI: {
        label: 'Raag Darbari',
        tagline: 'Power. Policy. People.',
        description: 'Truth spoken to authority.',
        parentSection: 'STATE_AND_STEWARDSHIP',
    },

    // ── NATURE_AND_NURTURE ──────────────────────────────
    NATURE: {
        label: 'Nature',
        tagline: 'Where the Wild Breathes Free',
        description: 'Land older than law.',
        parentSection: 'NATURE_AND_NURTURE',
    },
    WELLNESS: {
        label: 'Wellness',
        tagline: 'Healing Starts Here',
        description: 'Stillness as medicine.',
        parentSection: 'NATURE_AND_NURTURE',
    },

    // ── SPIRIT_AND_STORY ────────────────────────────────
    ODYSSEY: {
        label: 'Odyssey',
        tagline: 'Sacred Trails & Scenic Tales',
        description: 'Journeys of faith and foot.',
        parentSection: 'SPIRIT_AND_STORY',
    },
    MOORINGS: {
        label: 'Moorings',
        tagline: 'Where Culture Anchors the Soul',
        description: 'Traditions that keep us rooted.',
        parentSection: 'SPIRIT_AND_STORY',
    },
};

export const VALID_SECTIONS = new Set(Object.keys(SECTIONS));
export const VALID_SUBSECTIONS = new Set(Object.keys(SUBSECTIONS));

export function getSubsectionsForSection(section: string): string[] {
    return Object.entries(SUBSECTIONS)
        .filter(([, meta]) => meta.parentSection === section)
        .map(([key]) => key);
}

export function validateSection(section: string): Result<string, RequestError> {
    if (!VALID_SECTIONS.has(section)) {
        return err(
            new RequestError(
                `${ERRORS.INVALID_SECTION.message}: ${section}. Valid sections: ${[...VALID_SECTIONS].join(', ')}`,
                ERRORS.INVALID_SECTION.code,
                ERRORS.INVALID_SECTION.statusCode,
            ),
        );
    }
    return ok(section);
}

export function validateSubsections(subsections: string[], section: string): Result<string[], RequestError> {
    const allowed = getSubsectionsForSection(section);
    const allowedSet = new Set(allowed);

    for (const sub of subsections) {
        if (!allowedSet.has(sub)) {
            return err(
                new RequestError(
                    `${ERRORS.INVALID_SUBSECTION.message}: "${sub}" for section "${section}". Valid: ${allowed.join(', ')}`,
                    ERRORS.INVALID_SUBSECTION.code,
                    ERRORS.INVALID_SUBSECTION.statusCode,
                ),
            );
        }
    }

    return ok(subsections);
}
