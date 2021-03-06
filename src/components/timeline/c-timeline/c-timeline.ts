/*
Copyright 2020, Verizon Media
Licensed under the terms of the MIT license. See the LICENSE file in the project root for license terms.
*/

import {autoinject, bindable, bindingMode, containerless, TaskQueue} from 'aurelia-framework';
import * as moment from 'moment-timezone';

import {ITimeBlock, ITimeDay, ITimeEntry, ITimeEntryBasic, ITimelineActions} from './c-timeline-interfaces';
import {filterEntriesDay, mapEntries} from './workers';

import {authState} from '../../../decorators/auth-state';
import {generateRandom} from '../../../helpers/generate-random';
import {CToastsService} from '../../toasts/c-toasts/c-toasts-service';

import * as CTimelineWeekContainerStyles from '../c-timeline-week-container/c-timeline-week-container.css.json';

type Moment = moment.Moment;

/**
 * Data about each available zoom level
 */
export const ZOOM_LEVELS: any = [
    {
        defaultTimeBlocks: 12,
        minutes: 120,
    },
    {
        defaultTimeBlocks: 24,
        minutes: 60,
    },
    {
        defaultTimeBlocks: 48,
        minutes: 30,
    },
    {
        defaultTimeBlocks: 96,
        minutes: 15,
    },
    {
        defaultTimeBlocks: 288,
        minutes: 5,
    },
    {
        defaultTimeBlocks: 1440,
        minutes: 1,
    },
];

export const BLOCK_HEIGHT = 50;

const DEFAULT_ZOOM = 2;
const MINUTES_IN_DAY = 1440;
const HOURS_IN_DAY = 24;
const TIME_REGEX = /^[0-9]{1,4}$/;
const SECONDS_IN_MINUTE = 60;

/**
 * Create arrays that show the times allowed for blocks to appear at each zoom level
 */
const mapAllowedTimes = () => {
    _.forEach(ZOOM_LEVELS, (level, index: number) => {
        level.allowedMinutes = [0];
        level.allowedHours = Array(HOURS_IN_DAY)
            .fill(null)
            .map((_num, idx) => idx);

        switch (index) {
            case 0:
                _.remove(level.allowedHours, (num: number) => num % 2 === 1);
            case 1:
                break;
            case 2:
                level.allowedMinutes.push(30);
                break;
            case 3:
                _.times(3, num => level.allowedMinutes.push((num + 1) * 15));
                break;
            case 4:
                _.times(11, num => level.allowedMinutes.push((num + 1) * 5));
                break;
            case 5:
                _.times(59, num => level.allowedMinutes.push(num + 1));
                break;
            default:
                break;
        }
    });
};

@containerless
@authState
@autoinject
export class CTimeline {
    @bindable
    public isLoading: boolean = false;

    @bindable
    public isLoadingTop: boolean = false;

    @bindable
    public isLoadingBottom: boolean = false;

    @bindable({defaultBindingMode: bindingMode.twoWay})
    public date: string;

    @bindable
    public days: number = 1;

    @bindable({defaultBindingMode: bindingMode.twoWay})
    public timeView: string = 'day';

    @bindable
    public zoomLevel: number = DEFAULT_ZOOM;

    @bindable
    public entries: ITimeEntryBasic[] = [];

    @bindable
    public actions: ITimelineActions = {};

    @bindable
    public startTime: string = null;

    @bindable
    public endTime: string = null;

    @bindable
    public offsetTime: string = null;

    @bindable
    public scrollDays: number = 1;

    @bindable
    public snapAdd: boolean = false;

    @bindable
    public preventCreate;

    @bindable
    public editEntryViewModel: string = null;

    @bindable
    public newEntryViewModel: string = null;

    @bindable
    public timezone: string = null;

    @bindable
    public scrollTime: string = null;

    public transformedEntries: ITimeEntry[] = [];
    public blocks: ITimeBlock[] = [];
    public displayDays: ITimeDay[] = [];
    public currentTimeLine: number = -1;
    public currentTimeLineTracker = null;
    public isRendering: boolean = false;
    public scrollCurrentTime: boolean = true;
    public scrollLastSpot: boolean = false;
    public parentScrollElem: JQuery<HTMLElement> = null;
    public id = generateRandom();
    public currentScroll: number = 0;
    public preventScrollCheck: boolean = true;
    public placeholderEntry: any;
    public newItem: any = null;

    /**
     * Build out the timeline. Put in a throttle so it doesn't bind up
     */
    public buildTimeline = _.debounce(
        () => {
            this.buildBlocks();
            this.calculateCurrentTimeLine();
            this.transformEntries();
        },
        200,
        {trailing: false, leading: true},
    );

    /**
     * Take entries that are input and transform them into entries the calendar can use
     */
    // tslint:disable-next-line:ter-arrow-parens
    public transformEntries = _.throttle(async (noAutoScroll?) => {
        const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];
        const pxPerMinute = BLOCK_HEIGHT / zoomLevelData.minutes;
        const [startTime, endTime] = this.getDayStartEndTimes();

        const sortedEntries = _.sortBy(this.entries, entry => {
            if (this.date) {
                return entry.start;
            }

            return moment(entry.start, 'hmm').toISOString();
        });

        try {
            if (this.timeView === 'day') {
                const dayEntries = await filterEntriesDay(
                    sortedEntries,
                    startTime.toISOString(),
                    endTime.toISOString(),
                );
                this.transformedEntries = await mapEntries(
                    dayEntries,
                    pxPerMinute,
                    startTime.toISOString(),
                    endTime.toISOString(),
                    this.timeView,
                    this.editEntryViewModel,
                    this.date,
                    this.getTzOffet(),
                    this.zoomLevel,
                );
            }

            if (this.timeView === 'week' || this.timeView === 'three-day') {
                for (const day of this.displayDays) {
                    const dayEntries = await filterEntriesDay(
                        sortedEntries,
                        startTime.toISOString(),
                        endTime.toISOString(),
                    );
                    day.entries = await mapEntries(
                        dayEntries,
                        pxPerMinute,
                        startTime.toISOString(),
                        endTime.toISOString(),
                        this.timeView,
                        this.editEntryViewModel,
                        this.date,
                        this.getTzOffet(),
                        this.zoomLevel,
                    );

                    startTime.add(1, 'day');
                    endTime.add(1, 'day');
                }
            }
        } catch (e) {
            this.notification.error('There was an error parsing the entries. Please try again.');
        }

        this.taskQueue.queueMicroTask(() => {
            this.isRendering = false;

            this.trackPosistion.cancel();
            this.preventScrollCheck = true;

            // Don't break unless we have actually transformed the entries
            // at least once (so that it can scroll to the current time)
            if (noAutoScroll) {
                return;
            }

            // Could potentially be 350ms behind with the combined throttles
            _.delay(() => {
                this.trackPosistion.cancel();

                if (!this.scrollLastSpot) {
                    this.scrollCurrentTime = true;
                }
                this.scrollToSpot();
            }, 400);
        });
    }, 100);

    public togglePopover = _.debounce(
        ($event, day?: ITimeDay) => {
            if (
                // @ts-ignore
                this._state === 'disabled' ||
                (_.isBoolean(this.preventCreate) && this.preventCreate)
            ) {
                return;
            }

            let isoTime;
            const dayWeek = day;

            const dayDate = day ? dayWeek.date : null;
            const [zoomLevelData, pxPerMinute] = this.getZoomLevelData();
            const [blockStart] = this.getDayStartEndTimes(dayDate);

            const relativeY = $event.pageY - this.parentScrollElem.offset().top;
            // On week view, get the height of the date names so we can offset
            const elemDiff = day ? $(`.${CTimelineWeekContainerStyles.dates}`).outerHeight() : 0;
            const pxDown = relativeY + this.parentScrollElem.scrollTop() - elemDiff;
            const blockIndex = Math.floor(pxDown / BLOCK_HEIGHT);

            if (dayWeek) {
                dayWeek.newItem = null;
                isoTime = dayWeek.blocks[blockIndex].isoTime;

                _.forEach(this.displayDays, weekDay => (weekDay.newItem = null));
            } else {
                this.newItem = null;
                isoTime = this.blocks[blockIndex].isoTime;
            }

            const minutesFromTop = pxDown / pxPerMinute;

            const clickedTime = moment(blockStart)
                .add(minutesFromTop, 'minutes')
                .startOf(this.zoomLevel < 5 ? 'minute' : 'second');
            const startTime: Moment = moment(clickedTime).subtract(zoomLevelData.minutes / 2, 'minutes');
            const endTime: Moment = moment(clickedTime).add(zoomLevelData.minutes / 2, 'minutes');

            const matchingEntries: ITimeEntry[] = [];

            const entries = dayWeek ? dayWeek.entries : this.transformedEntries;

            if (this.snapAdd) {
                (matchingEntries as any[]) = _.filter(entries, entry =>
                    moment(entry.end).isBetween(startTime, endTime, null, '[)'),
                );
            }

            let top = blockIndex * BLOCK_HEIGHT;
            let startIso = null;

            if (!matchingEntries.length) {
                const isoTimeMoment = moment(isoTime);
                const halfBlock = BLOCK_HEIGHT / 2;

                if ($event.layerY >= halfBlock) {
                    top += halfBlock;
                    isoTimeMoment.add((halfBlock / pxPerMinute) * SECONDS_IN_MINUTE, 'seconds');
                }

                startIso = isoTimeMoment.toISOString();
            } else {
                const sortedEntries = _.sortBy(matchingEntries, entry =>
                    Math.abs(moment(entry.end).diff(clickedTime, 'seconds')),
                );
                const firstEntry = _.first(sortedEntries);
                const diff = Math.ceil(moment(isoTime).diff(firstEntry.end, 'seconds')) * -1;

                top += Math.floor((diff / SECONDS_IN_MINUTE) * pxPerMinute);
                startIso = firstEntry.end;
            }

            if (_.isFunction(this.preventCreate) && this.preventCreate({isoTime: startIso})) {
                return;
            }

            const newItem: any = {
                top,
                color: 'secondary',
                height: 50,
                isoTime: startIso,
                placeholder: true,
                title: `${moment(startIso).format(this.zoomLevel < 5 ? 'HH:mm' : 'HH:mm:ss')} (New Item)`,
                zoomLevel: this.zoomLevel,
            };

            if (this.newEntryViewModel) {
                newItem.contentViewModel = this.newEntryViewModel;
            }

            if (!dayWeek) {
                this.newItem = _.cloneDeep(newItem);

                _.defer(() => {
                    if (this.placeholderEntry) {
                        this.placeholderEntry.openPopover();
                    }
                });
            } else {
                dayWeek.newItem = _.cloneDeep(newItem);

                _.defer(() => {
                    if (dayWeek.placeholderEntry) {
                        dayWeek.placeholderEntry.openPopover();
                    }
                });
            }
        },
        500,
        {leading: true, trailing: false},
    );

    private calculateCurrentTimeLine = _.throttle(
        () => {
            if (this.timeView === 'month') {
                return;
            }

            const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];
            const pxPerMinute = BLOCK_HEIGHT / zoomLevelData.minutes;

            const [startTime, endTime] = this.getDayStartEndTimes();
            const now = moment();

            if (this.timeView === 'day') {
                if (now.isBetween(startTime, endTime, null, '()')) {
                    const diff = now.diff(startTime, 'seconds');
                    this.currentTimeLine = (diff / SECONDS_IN_MINUTE) * pxPerMinute + 1;
                } else {
                    this.currentTimeLine = -1;
                }
            } else {
                _.forEach(this.displayDays, day => {
                    if (now.isBetween(startTime, endTime, null, '()')) {
                        const diff = now.diff(startTime, 'seconds');
                        day.currentTimeLine = (diff / SECONDS_IN_MINUTE) * pxPerMinute + 1;
                    } else {
                        day.currentTimeLine = -1;
                    }

                    startTime.add(1, 'day');
                    endTime.add(1, 'day');
                });
            }
        },
        250,
        {trailing: true, leading: false},
    );

    private trackPosistion = _.debounce(
        () => {
            if (this.isRendering || this.isLoading || this.preventScrollCheck) {
                return;
            }

            const [, pxPerMinute] = this.getZoomLevelData();
            const parentHeight = this.parentScrollElem.outerHeight();
            const currentPos = this.parentScrollElem.scrollTop() + parentHeight / 2;

            if (parentHeight >= $(`#${this.id}`).outerHeight()) {
                return;
            }

            this.currentScroll = currentPos / pxPerMinute; // Minutes from the middle of the timeline view
        },
        1000,
        {trailing: true, leading: false},
    );

    constructor(private taskQueue: TaskQueue, private notification: CToastsService) {
        // Generate allowed times at each level
        mapAllowedTimes();
    }

    public attached() {
        // Trigger the default TZ stuff
        if (!this.timezone) {
            this.setupTimezone();
        }

        this.getParentScrollElem();
        this.buildTimeline();

        this.currentTimeLineTracker = setInterval(() => {
            this.calculateCurrentTimeLine();
        }, SECONDS_IN_MINUTE * 1000);

        $(this.parentScrollElem).on('scroll', this.trackPosistion);
    }

    public detatched() {
        if (this.currentTimeLineTracker) {
            clearInterval(this.currentTimeLineTracker);
        }

        if (this.parentScrollElem) {
            $(this.parentScrollElem).off('scroll', this.trackPosistion);
        }
    }

    // Observable properties
    // Listen to rebuild data
    public zoomLevelChanged(_new, old) {
        // Doesn't need to run on init
        if (_.isUndefined(old)) {
            return;
        }

        this.scrollLastSpot = true;
        this.renderTimeline();
    }

    public timeViewChanged() {
        this.renderTimeline();
    }

    public daysChanged() {
        if (this.timeView === 'week') {
            this.renderTimeline();
        }
    }

    public scrollDaysChanged() {
        this.buildTimeline();
    }

    public entriesChanged() {
        // Don't update unless there are blocks displaying
        if (this.blocks.length) {
            this.transformEntries(true);
        }
    }

    public dateChanged() {
        this.renderTimeline();
    }

    public timezoneChanged() {
        this.setupTimezone(true);
    }

    public scrollTimeChanged(_new, old) {
        // Doesn't need to run on init
        if (_.isUndefined(old)) {
            return;
        }

        const scrollTime = moment(this.scrollTime, 'HH:mm');

        if (this.scrollTime && (!scrollTime.isValid() || this.isRendering || this.isLoading)) {
            return;
        }

        this.scrollToSpot(this.scrollTime);
    }

    /**
     * Changes week view to day view and navigates to that date
     *
     * @param day ISO Date string of date clicked on in week view
     */
    public dayClick(day) {
        this.date = moment(day).toISOString();
        this.timeView = 'day';
    }

    // Private methods

    /**
     * Return the offset in minutes from the selected timezone to the browser timezone
     */
    private getTzOffet(): number {
        const browserOffset = moment.tz.zone(moment.tz.guess()).utcOffset(moment());
        const offset = moment().utcOffset();

        return browserOffset + offset;
    }

    /**
     * Sets up the timezone data
     *
     * @param updateDate Boolean value to determine whether or not to update `this.date`
     */
    private setupTimezone(updateDate?: boolean) {
        const tzNames = moment.tz.names();
        const tzIndex = tzNames.findIndex(name => name === this.timezone);

        if (tzIndex > -1) {
            moment.tz.setDefault(this.timezone);
        } else {
            moment.tz.setDefault();
        }

        if (updateDate) {
            // This prevents issues where the date will look in the past and throw off the three-day view
            const offset = this.getTzOffet();
            this.date = moment(this.date)
                .add(offset * -1, 'minutes')
                .toISOString();
        }

        this.renderTimeline();
    }

    /**
     * Get the closest parent element that scrolls
     */
    private getParentScrollElem() {
        this.parentScrollElem = $(`#${this.id}`).closest(
            $(`#${this.id}`)
                .parents()
                .filter((_i, e) => $(e).css('overflow-y') === 'auto'),
        );
    }

    /**
     * If zoom goes out of bounds, fix it here
     */
    private fixZoomBounds() {
        if (this.timeView !== 'day' && this.timeView !== 'week' && this.timeView !== 'three-day') {
            return;
        }

        if (this.zoomLevel > 5) {
            this.zoomLevel = 5;
        } else if (this.zoomLevel < 0) {
            this.zoomLevel = 0;
        }
    }

    private renderTimeline() {
        this.isRendering = true;

        // If there is no delay, the browser chokes up and doesn't
        // display the loading indicator until the very end
        // 50ms wait seems to be a good middle ground
        _.delay(() => this.buildTimeline(), 50);
    }

    /**
     * Scroll to a designated spot on the timeline
     */
    private scrollToSpot(time?) {
        _.defer(() => {
            const [, pxPerMinute] = this.getZoomLevelData();

            let scrollTop = 0;

            if (time) {
                const [startTime, endTime] = this.getDayStartEndTimes();
                const now = moment(time, 'HH:mm');

                let timeToScroll = -1;

                if (this.timeView === 'day') {
                    if (now.isBetween(startTime, endTime, null, '()')) {
                        const diff = now.diff(startTime, 'seconds');
                        timeToScroll = (diff / SECONDS_IN_MINUTE) * pxPerMinute + 1;
                    }
                } else {
                    _.forEach(this.displayDays, () => {
                        if (now.isBetween(startTime, endTime, null, '()')) {
                            const diff = now.diff(startTime, 'seconds');
                            timeToScroll = (diff / SECONDS_IN_MINUTE) * pxPerMinute + 1;
                            return false;
                        }

                        startTime.add(1, 'day');
                        endTime.add(1, 'day');
                    });
                }

                if (timeToScroll > -1) {
                    scrollTop = timeToScroll - this.parentScrollElem.outerHeight() / 2;
                    this.currentScroll = timeToScroll / pxPerMinute;
                    this.parentScrollElem.animate({scrollTop}, 500);
                }
            } else if (this.scrollCurrentTime) {
                this.scrollCurrentTime = false;

                let currentTimeTop = -1;

                if (this.timeView === 'day') {
                    currentTimeTop = this.currentTimeLine;
                } else {
                    _.forEach(this.displayDays, day => {
                        if (day.currentTimeLine > -1) {
                            currentTimeTop = day.currentTimeLine;
                            return false;
                        }
                    });
                }

                if (currentTimeTop > -1) {
                    scrollTop = currentTimeTop - this.parentScrollElem.outerHeight() / 2;
                    this.currentScroll = currentTimeTop / pxPerMinute;
                    this.parentScrollElem.animate({scrollTop}, 500);
                }
            } else if (this.scrollLastSpot) {
                this.scrollLastSpot = false;
                scrollTop = this.currentScroll * pxPerMinute - this.parentScrollElem.outerHeight() / 2;
                this.parentScrollElem.animate({scrollTop}, 500);
            }

            // To be after the scroll animation
            _.delay(() => {
                this.preventScrollCheck = false;
                this.trackPosistion.cancel();
            }, 501);
        });
    }

    /**
     * Put together the time blocks needed for the different views
     */
    private buildBlocks() {
        this.fixZoomBounds();

        let date: any = this.date ? moment(this.date) : moment();
        date = date.startOf('day').toISOString();

        const [displayBlocksDay, startIndexes] = this.calculateBlocksNumStart();

        switch (this.timeView) {
            case 'day':
                this.blocks = this.buildDayBlocks(displayBlocksDay, startIndexes, date, this.scrollDays);
                break;
            case 'week':
                date = moment(date)
                    .startOf('week')
                    .toISOString();

                this.displayDays = [];

                this.blocks = this.buildDayBlocks(displayBlocksDay, startIndexes, date);

                _.times(this.days, () => {
                    const dayOfWeek: ITimeDay = {
                        date,
                        blocks: this.buildDayBlocks(displayBlocksDay, startIndexes, date),
                        entries: [],
                        today: moment().format('MMDDYYYY') === moment(date).format('MMDDYYYY'),
                    };

                    this.displayDays.push(dayOfWeek);
                    date = moment(date)
                        .add(1, 'days')
                        .toISOString();
                });
                break;
            case 'three-day':
                date = moment(date)
                    .subtract(1, 'day')
                    .startOf('day')
                    .toISOString();

                this.displayDays = [];

                this.blocks = this.buildDayBlocks(displayBlocksDay, startIndexes, date);

                _.times(3, () => {
                    const dayOfWeek: ITimeDay = {
                        date,
                        blocks: this.buildDayBlocks(displayBlocksDay, startIndexes, date),
                        entries: [],
                        today: moment().format('MMDDYYYY') === moment(date).format('MMDDYYYY'),
                    };

                    this.displayDays.push(dayOfWeek);
                    date = moment(date)
                        .add(1, 'days')
                        .toISOString();
                });
                break;
            case 'month':
                date = moment(date)
                    .startOf('month')
                    .toISOString();
            default:
                break;
        }
    }

    /**
     * Generate blocks for the 'day' view
     *
     * @param blocksPerDay Number: How many blocks per day being generated
     * @param startIndexes Number[]: When to start each day
     * @param isoDate ISO Date string: Start of the day
     * @param numOfDays Number: Number of days to show data (scrolling with lazyloaded data)
     */
    private buildDayBlocks(blocksPerDay, startIndexes, isoDate: string, numOfDays = 1): ITimeBlock[] {
        const blocks: ITimeBlock[] = [];
        const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];
        const [startHourIndex, startMinuteIndex] = startIndexes;
        const startHour = zoomLevelData.allowedHours[startHourIndex];
        const startMinute = zoomLevelData.allowedMinutes[startMinuteIndex];

        _.times(numOfDays, index => {
            const currentTime = isoDate ? moment(isoDate) : moment();

            currentTime
                .startOf('day')
                .add(index, 'days')
                .add(startHour, 'hours')
                .add(startMinute, 'minutes');

            _.times(blocksPerDay, () => {
                blocks.push({
                    isoTime: currentTime.toISOString(),
                    time: currentTime.format('HH:mm'),
                });

                currentTime.add(zoomLevelData.minutes, 'minutes');
            });
        });

        return blocks;
    }

    /**
     * Calculate how many blocks to display per day & what indexes to start at
     */
    private calculateBlocksNumStart(): [number, number[]] {
        const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];
        const displayBlocksDay = zoomLevelData.defaultTimeBlocks;
        let startIndexes = [0, 0];

        if (!this.startTime && !this.endTime && !this.offsetTime) {
            return [displayBlocksDay, startIndexes];
        }

        if (this.offsetTime) {
            const [offsetHour, offsetMinute] = this.getHoursMinutes(this.offsetTime);
            return [displayBlocksDay, [offsetHour, offsetMinute]];
        }

        const [startHour, startMinute] = this.getHoursMinutes(this.startTime);
        const [endHour, endMinute] = this.getHoursMinutes(this.endTime, true);

        if (moment(`${endHour}:${endMinute}`, 'h:mm').isSameOrBefore(moment(`${startHour}:${startMinute}`, 'h:mm'))) {
            return [displayBlocksDay, startIndexes];
        }

        let skippingBlocks = 0;

        if (startHour > 0 || startMinute > 0) {
            const startHourIndex = _.findIndex(zoomLevelData.allowedHours, allowedHour => allowedHour === startHour);
            const startMinuteIndex = _.findIndex(
                zoomLevelData.allowedMinutes,
                allowedMinute => allowedMinute === startMinute,
            );

            if (startHourIndex) {
                skippingBlocks += startHourIndex * zoomLevelData.allowedMinutes.length;
            }
            if (startMinuteIndex) {
                skippingBlocks += startMinuteIndex;
            }

            startIndexes = [startHourIndex, startMinuteIndex];
        }

        if (endHour > 0 || endMinute > 0) {
            const endHourIndex = _.findIndex(zoomLevelData.allowedHours, allowedHour => allowedHour === endHour) + 1;
            const endMinuteIndex =
                _.findIndex(zoomLevelData.allowedMinutes, allowedMinute => allowedMinute === endMinute) + 1;

            if (endHourIndex < zoomLevelData.allowedHours.length) {
                skippingBlocks +=
                    (zoomLevelData.allowedHours.length - endHourIndex) * zoomLevelData.allowedMinutes.length;
            }
            if (endMinuteIndex < zoomLevelData.allowedMinutes.length) {
                skippingBlocks += zoomLevelData.allowedMinutes.length - endMinuteIndex;
            }
        }

        return [displayBlocksDay - skippingBlocks, startIndexes];
    }

    /**
     * Parse out the hours and minutes passed in
     *
     * @param time String: Time shown in the following format ('0700', '07', '7', '0730', '730', ect.)
     * @param end Boolean: If the time is for the tail end of the display
     */
    private getHoursMinutes(time: string = '', end?: boolean): [number, number] {
        const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];
        let timeClone = time;

        if (!_.isString(timeClone)) {
            timeClone = _.toString(timeClone);
        }

        if (!timeClone.match(TIME_REGEX)) {
            if (!end) {
                return [0, 0];
            }

            return [_.last(zoomLevelData.allowedHours), _.last(zoomLevelData.allowedMinutes)];
        }

        let hour = 0;
        let minute = 0;

        switch (timeClone.length) {
            case 4:
                hour = parseInt(timeClone.slice(0, 2), 10);
                minute = parseInt(timeClone.slice(2), 10);
                break;
            case 3:
                hour = parseInt(timeClone.slice(0, 1), 10);
                minute = parseInt(timeClone.slice(1), 10);
                break;
            case 2:
            case 1:
            default:
                hour = parseInt(timeClone, 10);
                break;
        }

        if (zoomLevelData.allowedMinutes.indexOf(minute) === -1) {
            if (minute > _.last(zoomLevelData.allowedMinutes)) {
                minute = _.last(zoomLevelData.allowedMinutes);
            } else {
                for (let a = 0; a < zoomLevelData.allowedMinutes.length - 1; a += 1) {
                    if (minute > zoomLevelData.allowedMinutes[a] && minute < zoomLevelData.allowedMinutes[a + 1]) {
                        if (end) {
                            minute = zoomLevelData.allowedMinutes[a + 1];
                        } else {
                            minute = zoomLevelData.allowedMinutes[a];
                        }
                        break;
                    }
                }
            }
        }

        if (zoomLevelData.allowedHours.indexOf(hour) === -1) {
            if (hour > _.last(zoomLevelData.allowedHours)) {
                hour = _.last(zoomLevelData.allowedHours);
            } else {
                for (let a = 0; a < zoomLevelData.allowedHours.length - 1; a += 1) {
                    if (hour > zoomLevelData.allowedHours[a] && hour < zoomLevelData.allowedHours[a + 1]) {
                        if (end) {
                            hour = zoomLevelData.allowedHours[a + 1];
                        } else {
                            hour = zoomLevelData.allowedHours[a];
                        }
                        break;
                    }
                }
            }
        }

        return [hour, minute];
    }

    /**
     * Calculate the times for when the day starts
     */
    private getDayStartEndTimes(date?): [Moment, Moment] {
        const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];

        let startTime;
        let endTime;
        let addHours;
        let addMinutes;

        if (this.timeView === 'day') {
            if (this.date) {
                startTime = moment(this.date).startOf('day');
            } else {
                startTime = moment().startOf('day');
            }
        }

        if (this.timeView === 'week') {
            if (this.date) {
                startTime = moment(this.date).startOf('week');
            } else {
                startTime = moment().startOf('week');
            }
        }

        if (this.timeView === 'three-day') {
            if (this.date) {
                startTime = moment(this.date)
                    .subtract(1, 'day')
                    .startOf('day');
            } else {
                startTime = moment()
                    .subtract(1, 'day')
                    .startOf('day');
            }
        }

        if (date) {
            startTime = moment(date).startOf('day');
        }

        const blockTime = this.blocks[0].time;
        const numOfBlocks = this.blocks.length;
        addHours = moment(blockTime, 'HH:mm').format('H');
        addMinutes = moment(blockTime, 'HH:mm').format('m');

        startTime.add(addHours, 'hours').add(addMinutes, 'minutes');
        endTime = moment(startTime).add(numOfBlocks * zoomLevelData.minutes, 'minutes');

        return [moment(startTime), moment(endTime)];
    }

    private getZoomLevelData() {
        const zoomLevelData = ZOOM_LEVELS[this.zoomLevel];
        const pxPerMinute = BLOCK_HEIGHT / zoomLevelData.minutes;

        return [zoomLevelData, pxPerMinute];
    }
}
