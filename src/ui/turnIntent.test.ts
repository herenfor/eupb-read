import { describe, expect, it } from "vitest";
import { TurnIntentBuffer, WheelTurnAccumulator } from "./turnIntent";

describe("WheelTurnAccumulator", () => {
  it("小 delta 累积到阈值后只产生一次翻页", () => {
    const wheel = new WheelTurnAccumulator(80);
    expect(wheel.push(30)).toBeNull();
    expect(wheel.push(30)).toBeNull();
    expect(wheel.push(20)).toBe(1);
    expect(wheel.push(20)).toBeNull();
  });

  it("支持反向阈值，方向变化会抵消尚未完成的累计量", () => {
    const wheel = new WheelTurnAccumulator(80);
    expect(wheel.push(60)).toBeNull();
    expect(wheel.push(-100)).toBeNull();
    expect(wheel.push(-40)).toBe(-1);
  });

  it("reset 丢弃未达到阈值的旧滚轮量", () => {
    const wheel = new WheelTurnAccumulator(80);
    expect(wheel.push(70)).toBeNull();
    wheel.reset();
    expect(wheel.push(10)).toBeNull();
  });
});

describe("TurnIntentBuffer", () => {
  it("加载期间只保留最后方向，并在 ready 时消费一次", () => {
    const buffer = new TurnIntentBuffer();
    expect(buffer.request(1)).toBeNull();
    expect(buffer.request(1)).toBeNull();
    expect(buffer.request(-1)).toBeNull();

    expect(buffer.markReady()).toBe(-1);
    expect(buffer.markReady()).toBeNull();
  });

  it("ready 状态立即放行，不把正常翻页写入缓冲", () => {
    const buffer = new TurnIntentBuffer();
    expect(buffer.markReady()).toBeNull();
    expect(buffer.request(1)).toBe(1);
    expect(buffer.request(-1)).toBe(-1);
    expect(buffer.markReady()).toBeNull();
  });

  it("重复 loading 状态不会清掉持续滚轮产生的单槽意图", () => {
    const buffer = new TurnIntentBuffer();
    buffer.markLoading();
    expect(buffer.request(1)).toBeNull();
    buffer.markLoading();
    expect(buffer.markReady()).toBe(1);
  });

  it("错误或销毁会丢弃尚未执行的方向", () => {
    const buffer = new TurnIntentBuffer();
    expect(buffer.request(1)).toBeNull();
    buffer.reset();
    expect(buffer.markReady()).toBeNull();
    expect(buffer.isReady).toBe(true);
  });
});
