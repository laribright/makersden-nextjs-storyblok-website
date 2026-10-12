/** @jest-environment node */

import { findStory } from '@/lib/storyblok/storyblokRepository';

import { getPageProps } from '@/app/getPageProps';

jest.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: false }),
}));

jest.mock('@/lib/storyblok/storyblokRepository', () => ({
  findStory: jest.fn(),
  RESOLVED_RELATIONS: '',
}));

const mockFindStory = jest.mocked(findStory);

function prepareMissingPage(
  isPermanent?: boolean,
  failure: { status: number } = { status: 404 },
) {
  mockFindStory
    .mockResolvedValueOnce({
      story: {
        content: {
          redirects:
            isPermanent === undefined
              ? []
              : [
                  {
                    _uid: 'redirect',
                    component: 'RedirectItem',
                    from: '/old-page',
                    to: '/new-page',
                    isPermanent,
                  },
                ],
        },
      },
    })
    .mockResolvedValueOnce({ story: { content: {} } })
    .mockRejectedValueOnce(failure);
}

describe('Storyblok redirects', () => {
  beforeEach(() => {
    mockFindStory.mockReset();
  });

  it('uses a permanent redirect when the CMS marks a move as permanent', async () => {
    prepareMissingPage(true);

    await expect(
      getPageProps({ slug: '/old-page', locale: 'en' }),
    ).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/new-page;308;',
    });
  });

  it('keeps temporary CMS redirects temporary', async () => {
    prepareMissingPage(false);

    await expect(
      getPageProps({ slug: '/old-page', locale: 'de' }),
    ).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;push;/new-page;307;',
    });
  });

  it('keeps missing pages without a redirect as 404s', async () => {
    prepareMissingPage();

    await expect(
      getPageProps({ slug: '/old-page', locale: 'en' }),
    ).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it('does not hide upstream service failures with a redirect', async () => {
    const failure = { status: 503 };
    prepareMissingPage(true, failure);

    await expect(
      getPageProps({ slug: '/old-page', locale: 'en' }),
    ).rejects.toBe(failure);
  });
});
