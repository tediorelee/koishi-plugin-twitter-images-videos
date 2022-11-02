import { Context, segment } from 'koishi'
import { nextTick } from 'process';
import Schema from 'schemastery'

export const name = 'twitter-images-videos'

export interface Config {
  authToken: string;
  allowNudity: boolean;
}

export const Config = Schema.object({
  authToken: Schema.string().default('').required().description('请填写你的twitter auth token'),
  allowNudity: Schema.boolean().default(false).description('是否显示敏感内容，开启是允许显示')
})

export const FILE_TYPE_PHOTO = 'photo';
export const FILE_TYPE_VIDEO = 'video';
export const FILE_TYPE_GIF = 'animated_gif';
export const FILE_CONTENT_TYPE_VIDEO = 'video/mp4';

const apiEndpointPrefix = 'https://api.twitter.com/1.1/statuses/show.json?id=';

export function apply(ctx: Context, config: Config) {
  async function fetchDataFromAPI(id: string) {
    const headers: object = {
      Authorization: config.authToken
    };
    return await ctx.http.get(apiEndpointPrefix + id, {headers});
  };

  ctx.middleware(async (session, next) => {
    // ignore when no a valid instagram url
    if (!session.content.includes('twitter.com')) return next()
    const regExp = /\d{15,}/;
    const id = session.content.match(regExp)[0];
    
    try {
      const result = await fetchDataFromAPI(id);
      if (result.possibly_sensitive && !config.allowNudity) {
        return '包含敏感内容，暂不解析!';
      }
      const { extended_entities: { media } } = result;
      const text = result.text.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '') || ''; //tweet desc
      const user = result.user; //user info obj
      media.forEach(async item => {
        if (item.type === FILE_TYPE_PHOTO) {
          const img = await ctx.http.get<ArrayBuffer>(item.media_url_https, {
            responseType: 'arraybuffer',
          })
          await session.sendQueued(`@${user.screen_name}: ${text} ${segment.image(img)}`)
        } else if (item.type === FILE_TYPE_VIDEO) {
          const videos = item.video_info.variants.filter(v => v.content_type === FILE_CONTENT_TYPE_VIDEO);
          const maxBitrate = Math.max.apply(Math, videos.map(video => { return video.bitrate }));
          const bestQualityVideo = videos.find(v => v.bitrate === maxBitrate)?.url;
          await session.sendQueued(segment.video(bestQualityVideo))
        } else if (item.type === FILE_TYPE_GIF) {
          await session.sendQueued(segment.video(item.video_info.variants[0].url))
        }
      });
    } catch(err) {
      console.log(err);
      return `发生错误!;  ${err}`;
    }
    return next();
  })
}
