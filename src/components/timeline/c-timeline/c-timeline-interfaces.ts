/*
Copyright 2020, Verizon Media
Licensed under the terms of the MIT license. See the LICENSE file in the project root for license terms.
*/

export interface ITimelineActions {
    scrollTop?(): void;
    scrollBottom?(): void;
}

export interface ITimeEntryBasic {
    accentColor?: string;
    active?: boolean;
    altTime?: string;
    background?: string;
    color?: string;
    duration: number;
    end?: string;
    icons?: string[];
    sizeDay?: string;
    sizeWeek?: string;
    start: string;
    title: string;
}

export interface ITimeEntry extends ITimeEntryBasic {
    contentViewModel?: string;
    endTime: string;
    height: number;
    isoTime?: string;
    placeholder?: boolean;
    rightCalc?: number;
    shiftIcons?: boolean;
    startTime: string;
    top: number;
    widthCalc?: string;
}

export interface ITimeBlock {
    isoTime?: string;
    time: string;
    newItem?: any;
}

export interface ITimeDay {
    currentTimeLine?: number;
    blocks: ITimeBlock[];
    date: string;
    entries: ITimeEntry[];
    newItem?: any;
    parsedDate?: string;
    placeholderEntry?: any;
    today?: boolean;
}
