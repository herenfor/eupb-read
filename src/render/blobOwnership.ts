export type BlobUrlRevoke = (url: string) => void;

/**
 * 管理一次 sanitize/load 产生的 Blob URL 所有权。
 *
 * 资源服务器的图片/字体 URL 不经过此类；只有创建者明确登记的局部 URL
 * 才会被撤销。revokeAll 幂等，适用于失败、过期、换章和 dispose 的重叠清理。
 */
export class OwnedBlobUrls {
  private urls = new Set<string>();

  constructor(private readonly revoke: BlobUrlRevoke = (url) => URL.revokeObjectURL(url)) {}

  add(url: string): string {
    this.urls.add(url);
    return url;
  }

  revokeAll(): void {
    for (const url of this.urls) this.revoke(url);
    this.urls.clear();
  }

  get size(): number {
    return this.urls.size;
  }
}
