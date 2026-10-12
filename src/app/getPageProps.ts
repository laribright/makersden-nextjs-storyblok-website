import { type Metadata } from 'next';
import { draftMode } from 'next/headers';
import {
  notFound,
  permanentRedirect,
  redirect,
  RedirectType,
} from 'next/navigation';

import { buildStoryblokMetadata } from '@/lib/metadata/buildStoryblokMetadata';
import {
  type ArticleSbContent,
  type GlobalSettingsSbContent,
  type PageSbContent,
  type StoryblokStory,
  type TranslationsSbContent,
} from '@/lib/storyblok';
import {
  findStory,
  RESOLVED_RELATIONS,
} from '@/lib/storyblok/storyblokRepository';

import { defaultLocale, type Locale } from '@/i18n/config';
import {
  buildLocalizedPath,
  getAvailableLocalesForStory,
  getLanguageAlternatesForLocales,
} from '@/i18n/paths';

import { type PageProps } from '@/types';

type StoryPageContent = PageSbContent | ArticleSbContent;

export const getPageProps = async (
  args: {
    slug: string;
    locale: string | undefined;
  } & Record<string, string | undefined>,
) => {
  const { slug: slugArgs, locale } = args;

  const isPreview = (await draftMode()).isEnabled;
  const slugAsStr = slugArgs;

  // "/home" as a path should only work within Storyblok
  if (slugAsStr === 'home' && !isPreview) {
    return {
      notFound: true,
    };
  }

  // Default to 'home' for globals and empty slug
  const slug: string =
    !slugAsStr || slugAsStr.startsWith('globals') ? 'home' : slugAsStr;

  let globalSettingsStory: StoryblokStory<GlobalSettingsSbContent> | undefined =
    undefined;

  try {
    const globalSettingsResponseData = await findStory<
      StoryblokStory<GlobalSettingsSbContent>
    >({
      slug: 'globals/settings',
      locale,
      isPreview,
      resolveLinks: 'url',
    });

    globalSettingsStory = globalSettingsResponseData?.story;
  } catch (err) {
    console.error('Unable to load global from Storyblok', err);
  }

  if (!globalSettingsStory) {
    throw new Error('Unable to load global settings');
  }

  let translations: StoryblokStory<TranslationsSbContent> | undefined =
    undefined;

  try {
    const translationsResponseData = await findStory<
      StoryblokStory<TranslationsSbContent>
    >({
      slug: 'globals/translations',
      locale,
      isPreview,
    });

    translations = translationsResponseData?.story;
  } catch (err) {
    console.error('Unable to load global from Storyblok', err);
  }

  if (!translations) {
    throw new Error('Unable to load translations');
  }

  // Look for Content manager defined redirects
  const redirectItems = globalSettingsStory.content.redirects ?? [];
  const redirectItem = redirectItems.find((item) => item.from === slug);

  try {
    const pageData = await findStory<StoryblokStory<StoryPageContent>>({
      slug,
      locale,
      isPreview,
      resolveRelations: RESOLVED_RELATIONS,
    });

    if (!pageData?.story) {
      throw new Error(`No data or data didn't contain story for ${slug}`);
    }

    const pageStory = pageData.story;

    return {
      globalSettingsStory: globalSettingsStory,
      translations: translations.content,
      story: pageStory,
      preview: !!isPreview,
      locale,
      availableLocales: getAvailableLocalesForStory(
        pageStory,
        (locale ?? defaultLocale) as Locale,
      ),
    };
  } catch (err) {
    // No story exists for this slug
    if ((err as { status?: number })?.status === 404) {
      if (redirectItem) {
        // this non-existent slug has a redirect setup
        if (redirectItem.isPermanent) {
          permanentRedirect(redirectItem.to ?? '', RedirectType.replace);
        }

        redirect(redirectItem.to ?? '', RedirectType.push);
      } else {
        notFound();
      }
    }

    throw err;
  }
};

export const getMetadata = async ({
  params,
}: Omit<PageProps, 'searchParams'>): Promise<Metadata> => {
  const { slug, locale } = await params;

  const pathname = slug?.length ? '/' + slug?.join('/') : '';
  const canonicalPath = buildLocalizedPath(
    pathname || 'home',
    locale ?? defaultLocale,
  );
  const pageProps = await getPageProps({
    slug: pathname,
    locale: locale,
  });

  const { availableLocales, globalSettingsStory, story } = pageProps;

  if (!story || !globalSettingsStory) {
    return {};
  }

  const languages = getLanguageAlternatesForLocales(
    pathname || 'home',
    availableLocales,
  );

  return buildStoryblokMetadata({
    availableLocales,
    canonicalPath,
    content: story.content,
    globalSettings: globalSettingsStory.content,
    languages,
    locale,
  });
};
