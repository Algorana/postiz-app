import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

const instagramProvider = new InstagramProvider();

@Rules(
  "Instagram should have at least one attachment, if it's a story, it can have only one picture"
)
export class InstagramStandaloneProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'instagram-standalone';
  name = 'Instagram\n(Standalone)';
  isBetweenSteps = false;
  refreshCron = true;
  scopes = [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_insights',
  ];
  override maxConcurrentJob = 200; // Instagram standalone has stricter limits
  dto = InstagramDto;

  editor = 'normal' as const;
  maxLength() {
    return 2200;
  }

  private redirectUri() {
    const frontendUrl = process.env.FRONTEND_URL || '';
    const baseUrl =
      frontendUrl.indexOf('https') == -1
        ? `https://redirectmeto.com/${frontendUrl}`
        : frontendUrl;

    return `${baseUrl.replace(
      /\/$/,
      ''
    )}/integrations/social/instagram-standalone`;
  }

  public override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return instagramProvider.handleErrors(body, status);
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    const { access_token } = await (
      await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refresh_token}`
      )
    ).json();

    const {
      user_id,
      name,
      username,
      profile_picture_url = '',
    } = await (
      await fetch(
        `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url&access_token=${access_token}`
      )
    ).json();

    return {
      id: user_id,
      name,
      accessToken: access_token,
      refreshToken: access_token,
      expiresIn: dayjs().add(58, 'days').unix() - dayjs().unix(),
      picture: profile_picture_url || '',
      username,
    };
  }

  async generateAuthUrl() {
    const state = makeId(6);
    const redirectUri = this.redirectUri();
    const url =
      `https://www.instagram.com/oauth/authorize?enable_fb_login=0&client_id=${
        process.env.INSTAGRAM_APP_ID
      }&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${encodeURIComponent(
        this.scopes.join(',')
      )}` + `&state=${state}`;

    console.log('[Instagram Standalone] OAuth authorize URL debug', {
      state,
      redirectUri,
      scope: this.scopes.join(','),
      url,
    });

    return {
      url,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    const formData = new URLSearchParams();
    formData.set('client_id', process.env.INSTAGRAM_APP_ID!);
    formData.set('client_secret', process.env.INSTAGRAM_APP_SECRET!);
    formData.set('grant_type', 'authorization_code');
    formData.set('redirect_uri', this.redirectUri());
    formData.set('code', params.code);

    console.log('[Instagram Standalone] OAuth redirect_uri debug', {
      frontendUrl: process.env.FRONTEND_URL,
      redirectUri: this.redirectUri(),
      codePrefix: params.code?.slice(0, 12),
    });

    const accessTokenResponse = await fetch(
      'https://api.instagram.com/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );
    const getAccessToken = await accessTokenResponse.json();

    console.log('[Instagram Standalone] OAuth token response debug', {
      ok: accessTokenResponse.ok,
      status: accessTokenResponse.status,
      keys: Object.keys(getAccessToken || {}),
      error_type: getAccessToken?.error_type,
      error_message: getAccessToken?.error_message,
      error: getAccessToken?.error,
      has_access_token: !!getAccessToken?.access_token,
      permissions: getAccessToken?.permissions,
    });

    const { access_token, expires_in, ...all } = await (
      await fetch(
        'https://graph.instagram.com/access_token' +
          '?grant_type=ig_exchange_token' +
          `&client_id=${process.env.INSTAGRAM_APP_ID}` +
          `&client_secret=${process.env.INSTAGRAM_APP_SECRET}` +
          `&access_token=${getAccessToken.access_token}`
      )
    ).json();

    const permissions = getAccessToken.permissions;
    const permissionsList = Array.isArray(permissions)
      ? permissions
      : decodeURIComponent(permissions || '').split(
          permissions?.includes(',')
            ? ','
            : permissions?.includes(' ')
            ? ' '
            : '-'
        );

    console.log('[Instagram Standalone] OAuth permissions debug', {
      required: this.scopes,
      received: permissions,
      parsed: permissionsList,
      missing: this.scopes.filter((scope) => !permissionsList.includes(scope)),
    });

    this.checkScopes(this.scopes, getAccessToken.permissions);

    const { user_id, name, username, profile_picture_url } = await (
      await fetch(
        `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url&access_token=${access_token}`
      )
    ).json();

    return {
      id: user_id,
      name,
      accessToken: access_token,
      refreshToken: access_token,
      expiresIn: dayjs().add(58, 'days').unix() - dayjs().unix(),
      picture: profile_picture_url,
      username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return instagramProvider.post(
      id,
      accessToken,
      postDetails,
      integration,
      'graph.instagram.com'
    );
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return instagramProvider.comment(
      id,
      postId,
      lastCommentId,
      accessToken,
      postDetails,
      integration,
      'graph.instagram.com'
    );
  }

  async analytics(id: string, accessToken: string, date: number) {
    return instagramProvider.analytics(
      id,
      accessToken,
      date,
      'graph.instagram.com'
    );
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ) {
    return instagramProvider.postAnalytics(
      integrationId,
      accessToken,
      postId,
      date,
      'graph.instagram.com'
    );
  }
}
