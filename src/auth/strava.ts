import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

interface StravaProfile {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
  username?: string;
}

export default function Strava<P extends StravaProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: "strava",
    name: "Strava",
    type: "oauth",
    authorization: {
      url: "https://www.strava.com/oauth/authorize",
      params: {
        scope: "read,activity:read_all",
        approval_prompt: "auto",
        response_type: "code",
      },
    },
    token: "https://www.strava.com/api/v3/oauth/token",
    userinfo: "https://www.strava.com/api/v3/athlete",
    profile(profile) {
      return {
        id: String(profile.id),
        name: `${profile.firstname} ${profile.lastname}`.trim(),
        email: null,
        image: profile.profile,
      };
    },
    style: { brandColor: "#fc4c02" },
    options,
  };
}
