/*
Copyright 2020, Verizon Media
Licensed under the terms of the MIT license. See the LICENSE file in the project root for license terms.
*/

import {bindable} from 'aurelia-framework';
import * as styles from './c-form-warning.css.json';

export class CFormWarning {
    @bindable
    public state;

    public styles = styles;
}
