export interface VisibilityGateOptions {
  /** 最长隐藏时间；超时只解除显示门，不把内容误标记为 ready。 */
  timeoutMs: number;
  onTimeout?: (token: number) => void;
}

interface InlineVisibility {
  value: string;
  priority: string;
}

interface ActiveGate {
  token: number;
  original: InlineVisibility;
  timer: number;
}

/**
 * 保持元素参与布局但暂不绘制，并用代次阻止旧异步任务揭示新内容。
 *
 * 这个类只管理“能否显示”，不判断章节是否 ready。调用方必须在字体、
 * 二阶段补偿、分页和目标位置全部完成后，使用同一 token 解除显示门。
 */
export class VisibilityGate {
  private active: ActiveGate | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly options: VisibilityGateOptions
  ) {}

  /** 开始或转交隐藏阶段；连续切章时保留最初的 inline visibility。 */
  hold(token: number): void {
    const original = this.active?.original ?? {
      value: this.element.style.getPropertyValue("visibility"),
      priority: this.element.style.getPropertyPriority("visibility"),
    };
    if (this.active) this.clearTimer(this.active.timer);

    this.element.style.setProperty("visibility", "hidden", "important");
    const timer = this.setTimer(() => {
      if (this.release(token)) this.options.onTimeout?.(token);
    }, this.options.timeoutMs);
    this.active = { token, original, timer };
  }

  /** 只有当前代次可以解除显示门；返回是否实际完成了揭示。 */
  release(token: number): boolean {
    const active = this.active;
    if (!active || active.token !== token) return false;
    this.clearTimer(active.timer);
    if (active.original.value === "") {
      this.element.style.removeProperty("visibility");
    } else {
      this.element.style.setProperty(
        "visibility",
        active.original.value,
        active.original.priority
      );
    }
    this.active = null;
    return true;
  }

  /** 销毁时无条件恢复元素原有的 inline visibility。 */
  dispose(): void {
    if (this.active) this.release(this.active.token);
  }

  private setTimer(callback: () => void, timeoutMs: number): number {
    const view = this.element.ownerDocument?.defaultView;
    return view
      ? view.setTimeout(callback, timeoutMs)
      : globalThis.setTimeout(callback, timeoutMs);
  }

  private clearTimer(timer: number): void {
    const view = this.element.ownerDocument?.defaultView;
    if (view) view.clearTimeout(timer);
    else globalThis.clearTimeout(timer);
  }
}
