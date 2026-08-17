export type TurnDirection = 1 | -1;

/** 把滚轮/触控板的连续 delta 累积为离散翻页方向。 */
export class WheelTurnAccumulator {
  private amount = 0;

  constructor(private readonly threshold = 80) {}

  push(deltaY: number): TurnDirection | null {
    if (deltaY === 0) return null;
    this.amount += deltaY;
    if (this.amount >= this.threshold) {
      this.amount = 0;
      return 1;
    }
    if (this.amount <= -this.threshold) {
      this.amount = 0;
      return -1;
    }
    return null;
  }

  reset(): void {
    this.amount = 0;
  }
}

/**
 * display-ready 前只保留最后一个翻页方向。
 *
 * 这是意图槽而不是事件队列：持续滚轮可能产生几十个 wheel 事件，但一次
 * 章节准备完成最多消费一次，避免按事件数跳过多页或多章。
 */
export class TurnIntentBuffer {
  private ready = false;
  private pending: TurnDirection | null = null;

  /** 进入章节加载/最终定位阶段；已有待执行方向继续保留。 */
  markLoading(): void {
    this.ready = false;
  }

  /** ready 时返回立即执行方向；否则覆盖单槽并返回 null。 */
  request(direction: TurnDirection): TurnDirection | null {
    if (this.ready) return direction;
    this.pending = direction;
    return null;
  }

  /** 最终显示准备完成；取出且清空唯一待执行方向。 */
  markReady(): TurnDirection | null {
    this.ready = true;
    const direction = this.pending;
    this.pending = null;
    return direction;
  }

  /** 错误、换书或销毁时丢弃旧意图并回到未就绪。 */
  reset(): void {
    this.ready = false;
    this.pending = null;
  }

  get isReady(): boolean {
    return this.ready;
  }
}
