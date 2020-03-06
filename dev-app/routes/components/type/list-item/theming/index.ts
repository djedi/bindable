/*
Copyright 2020, Verizon Media
Licensed under the terms of the MIT license. See the LICENSE file in the project root for license terms.
*/

export class ListItemThemeProperties {
    public listItemThemeCols = [
        {
            _class: 'monospaced',
            colHeadName: 'name',
            colHeadValue: 'Name',
        },
        {
            _class: 'monospaced',
            colClass: 't450',
            colHeadName: 'default',
            colHeadValue: 'Default',
        },
    ];

    public listItemThemeProperties = [
        {
            default: 'var(--c_lightGray)',
            name: '--list-item-color',
        },
        {
            default: 'var(--c_white)',
            name: '--list-item-color-active',
        },
        {
            default: 'var(--c_primaryMain)',
            name: '--list-item-background-active',
        },
    ];
}
